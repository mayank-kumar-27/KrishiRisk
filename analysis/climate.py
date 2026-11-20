"""Season climate features from daily NASA POWER data - shared by 02_features (history) and
05_risk (scenarios), so both compute features in exactly the same way.

Agricultural year Y:  Kharif Y = 1 Jun Y .. 31 Oct Y;  Rabi Y = 1 Nov Y .. 31 Mar Y+1.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

SEASON_MONTHS = {"Kharif": (6, 10), "Rabi": (11, 3)}  # (first month, last month); Rabi wraps the year
MIN_COVERAGE = 0.95         # share of non-missing days needed in a season window
DRY_DAY_MM = 2.5            # IMD rainy-day threshold: a day below this is "dry"
DRY_SPELL_DAYS = 7          # a dry spell = run of >= 7 consecutive dry days
HEAT_TMAX_C = 35.0          # heat-stress day: Tmax > 35 degC
GDD_BASE_C = 10.0           # growing degree days base temperature (no upper cut-off)
ONSET_WINDOW_MM = 20.0      # onset: >= 20 mm in 3 days starting on a wet day ...
ONSET_FALSE_SPELL_MM = 5.0  # ... not followed within 30 days by 7 days totalling < 5 mm
ONSET_SEARCH_END = (9, 30)  # no onset found by 30 Sep -> onset missing (flagged)
SPI_MIN_POSITIVE = 10       # min non-zero 3-month totals to fit the SPI gamma distribution


def season_window(season: str, year: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    m0, m1 = SEASON_MONTHS[season]
    start = pd.Timestamp(year, m0, 1)
    end_year = year + 1 if m1 < m0 else year
    end = pd.Timestamp(end_year, m1, 1) + pd.offsets.MonthEnd(0)
    return start, end


def dry_spells(rain: np.ndarray) -> int:
    """Count runs of >= DRY_SPELL_DAYS consecutive days with rain < DRY_DAY_MM.
    Missing days break a run (conservative: never creates a spell from missing data)."""
    count = run = 0
    for r in rain:
        if not np.isnan(r) and r < DRY_DAY_MM:
            run += 1
        else:
            count += run >= DRY_SPELL_DAYS
            run = 0
    return count + (run >= DRY_SPELL_DAYS)


def onset_doy(dates: pd.DatetimeIndex, rain: np.ndarray, year: int) -> float:
    """Agronomic monsoon onset (after Sivakumar 1988): first day from 1 Jun that is wet
    (>= DRY_DAY_MM), starts a 3-day total >= 20 mm, and is not followed within 30 days by a
    7-day period totalling < 5 mm (a false start). Day of year, or NaN if not found by 30 Sep."""
    last = pd.Timestamp(year, *ONSET_SEARCH_END)
    r = np.nan_to_num(rain, nan=0.0)
    roll7 = pd.Series(r).rolling(7).sum().to_numpy()  # roll7[j] = sum r[j-6..j]
    for i, d in enumerate(dates):
        if d > last or i + 30 >= len(r):
            break
        if r[i] >= DRY_DAY_MM and r[i:i + 3].sum() >= ONSET_WINDOW_MM:
            if not (roll7[i + 7:i + 31] < ONSET_FALSE_SPELL_MM).any():
                return float(d.dayofyear)
    return np.nan


def monthly_rain(clim: pd.DataFrame) -> pd.DataFrame:
    """Monthly totals per district; a month counts only if >= MIN_COVERAGE of its days are present."""
    c = clim.assign(period=clim["date"].dt.to_period("M"))
    g = c.groupby(["district", "period"])["PRECTOTCORR"]
    monthly = g.sum(min_count=1).rename("rain_month").reset_index()
    cover = (g.count() / g.size()).reset_index(drop=True)
    monthly.loc[cover.values < MIN_COVERAGE, "rain_month"] = np.nan
    return monthly


def _rolling3(monthly: pd.DataFrame) -> dict[str, pd.Series]:
    out = {}
    for district, m in monthly.groupby("district"):
        m = m.set_index("period").sort_index()
        m = m.reindex(pd.period_range(m.index.min(), m.index.max(), freq="M"))
        out[district] = m["rain_month"].rolling(3, min_periods=3).sum()
    return out


def fit_spi(clim: pd.DataFrame) -> dict:
    """Gamma parameters of 3-month rainfall totals per district x calendar end-month, fitted on the
    whole record (zeros handled with a mixed distribution, McKee et al. 1993)."""
    params = {}
    for district, s3 in _rolling3(monthly_rain(clim)).items():
        for month in range(1, 13):
            x = s3[s3.index.month == month].dropna()
            pos = x[x > 0]
            if len(pos) < SPI_MIN_POSITIVE:
                continue
            a, _, scale = stats.gamma.fit(pos, floc=0)
            params[(district, month)] = ((x == 0).mean(), a, scale)
    return params


def spi_series(clim: pd.DataFrame, params: dict, rain_factor: float = 1.0) -> pd.Series:
    """SPI-3 per (district, month period). Rain is multiplied by rain_factor (scenarios) and then
    evaluated against the historical distribution in `params`."""
    vals = {}
    for district, s3 in _rolling3(monthly_rain(clim)).items():
        s3 = s3 * rain_factor
        for p, x in s3.dropna().items():
            par = params.get((district, p.month))
            if par is None:
                continue
            q, a, scale = par
            h = q + (1 - q) * stats.gamma.cdf(x, a, loc=0, scale=scale)
            vals[(district, p)] = stats.norm.ppf(np.clip(h, 1e-6, 1 - 1e-6))
    return pd.Series(vals, dtype=float)


def season_features(clim: pd.DataFrame, years: list[int], spi_params: dict,
                    rain_factor: float = 1.0, temp_delta: float = 0.0,
                    districts: list[str] | None = None) -> pd.DataFrame:
    """Raw per district x season x year features (no long-term-baseline features).
    rain_factor scales daily rainfall; temp_delta (degC) shifts daily Tmax and Tmin."""
    if districts is not None:
        clim = clim[clim["district"].isin(districts)]
    spi = spi_series(clim, spi_params, rain_factor)
    rows = []
    for district, dfd in clim.groupby("district"):
        dfd = dfd.set_index("date").sort_index()
        for season in SEASON_MONTHS:
            for year in years:
                start, end = season_window(season, year)
                w = dfd.loc[start:end]
                n_days = (end - start).days + 1
                coverage = w["PRECTOTCORR"].notna().sum() / n_days
                rec = {"district": district, "year": year, "season": season,
                       "climate_coverage": round(coverage, 3)}
                if coverage >= MIN_COVERAGE:
                    rain_s = w["PRECTOTCORR"] * rain_factor
                    rain = rain_s.to_numpy()
                    tmax, tmin = w["T2M_MAX"] + temp_delta, w["T2M_MIN"] + temp_delta
                    weekly = rain_s.resample("7D").sum(min_count=5)
                    tmean = (tmax + tmin) / 2
                    # SPI-3 windows lying fully inside the season: end months first+2 .. last
                    ends = pd.period_range(pd.Period(start, "M") + 2, pd.Period(end, "M"), freq="M")
                    spis = np.array([spi.get((district, p), np.nan) for p in ends], dtype=float)
                    rec.update({
                        "rain_mm": np.nansum(rain),
                        "spi3_mean": np.nanmean(spis) if np.isfinite(spis).any() else np.nan,
                        "spi3_min": np.nanmin(spis) if np.isfinite(spis).any() else np.nan,
                        "dry_spell_count": dry_spells(rain),
                        "rain_cv_weekly": weekly.std() / weekly.mean() if weekly.mean() > 0 else np.nan,
                        "heat_stress_days": int((tmax > HEAT_TMAX_C).sum()),
                        "gdd_base10": float((tmean - GDD_BASE_C).clip(lower=0).sum()),
                        "tmax_mean_c": tmax.mean(),
                        "tmin_mean_c": tmin.mean(),
                        "rh_mean_pct": w["RH2M"].mean(),
                        "onset_doy": onset_doy(w.index, rain, year) if season == "Kharif" else np.nan,
                    })
                rows.append(rec)
    return pd.DataFrame(rows)


def baselines(feat: pd.DataFrame) -> dict[str, pd.Series]:
    """Long-term district baselines from historical features."""
    g = feat.groupby(["district", "season"])["rain_mm"]
    return {"rain_mean": g.mean(), "rain_std": g.std(),
            "onset_median": feat.groupby("district")["onset_doy"].median()}


def add_baseline_features(feat: pd.DataFrame, base: dict[str, pd.Series]) -> pd.DataFrame:
    """rain_anomaly_z, rain_cv_interannual and onset_delay_days relative to the given baselines."""
    key = pd.MultiIndex.from_frame(feat[["district", "season"]])
    mean = base["rain_mean"].reindex(key).to_numpy()
    std = base["rain_std"].reindex(key).to_numpy()
    feat = feat.copy()
    feat["rain_anomaly_z"] = (feat["rain_mm"] - mean) / std
    feat["rain_cv_interannual"] = std / mean
    feat["onset_delay_days"] = feat["onset_doy"] - base["onset_median"].reindex(feat["district"]).to_numpy()
    return feat
