"""02 - Build the modelling table: one row = district x year x crop.

Inputs (written by 01_fetch_data.py)
  data/processed/crop_long.csv        crop area / production per district-year-crop-season
  data/raw/climate/climate_daily.csv  NASA POWER daily weather per district
  data/processed/soil_district.csv    soil properties per district
Outputs
  data/processed/master.csv
  data/processed/data_dictionary.md

Conventions
  * Agricultural year Y (data.gov.in "1997-98" -> 1997):
        Kharif Y = 1 Jun Y .. 31 Oct Y;   Rabi Y = 1 Nov Y .. 31 Mar Y+1.
  * Nothing is imputed. A value that cannot be computed honestly is left empty (NaN) and the
    reason is reported in the missing-value report at the end of the run.

Usage:  python analysis/02_features.py
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

import climate
import config
from climate import DRY_DAY_MM, DRY_SPELL_DAYS, GDD_BASE_C, HEAT_TMAX_C, MIN_COVERAGE
from common import PROCESSED, RAW_CLIMATE, get_logger, norm_name, rel

log = get_logger("02_features")

IN_CROP = PROCESSED / "crop_long.csv"
IN_CLIMATE = RAW_CLIMATE / "climate_daily.csv"
IN_SOIL = PROCESSED / "soil_district.csv"
OUT_MASTER = PROCESSED / "master.csv"
OUT_DICT = PROCESSED / "data_dictionary.md"

# ---- Parameters -------------------------------------------------------------------------
IQR_K = 1.5                # Tukey fence for yield outliers
MIN_GROUP_YEARS = 8        # min years per district-crop for IQR flags and trend fitting

# Default crop -> season. Keys are norm_name(crop). Override in config.CROP_SEASON_OVERRIDES.
CROP_SEASON_DEFAULT = {
    **dict.fromkeys(["rice", "paddy", "maize", "jowar", "kharifsorghum", "bajra", "pearlmillet",
                     "ragi", "fingermillet", "smallmillets", "arhartur", "pigeonpea", "tur",
                     "moonggreengram", "moong", "urad", "groundnut", "soyabean", "soybean",
                     "sesamum", "cottonlint", "cotton", "sugarcane", "jute", "mesta", "castorseed",
                     "castor", "nigerseed", "horsegram", "kodomillet", "otherkharifpulses"], "Kharif"),
    **dict.fromkeys(["wheat", "barley", "gram", "chickpea", "rabisorghum", "masoor", "lentil",
                     "rapeseedandmustard", "rapeseedmustard", "linseed", "safflower",
                     "peasandbeanspulses", "peas", "potato", "otherrabipulses"], "Rabi"),
}

# Upper bound of physically plausible district-average yield (t/ha). Anything above is treated
# as a data-entry/unit error. Deliberately generous: well above the best Indian district yields.
MAX_YIELD_T_HA = {"rice": 12, "paddy": 15, "wheat": 10, "maize": 15, "barley": 8, "jowar": 8,
                  "bajra": 6, "ragi": 7, "gram": 5, "arhartur": 5, "moonggreengram": 4, "urad": 4,
                  "masoor": 4, "groundnut": 7, "soyabean": 6, "rapeseedandmustard": 5,
                  "cottonlint": 5, "sugarcane": 200, "potato": 60}
MAX_YIELD_DEFAULT = 25

# Bale weights for crops that data.gov.in reports in bales (Indian standard bales).
BALE_KG = {"cottonlint": 170, "cotton": 170, "jute": 180, "mesta": 180, "sannhamp": 180}

# ---- Soil Degradation Score weights ----------------------------------------------------------
# Each component is min-max scaled across the districts in the study area (0 = best district,
# 1 = worst district), so the score is RELATIVE within the state, not an absolute soil-health grade.
#   Organic carbon 0.30 - SOC loss is the central indicator of soil degradation: it drives
#                         structure, water-holding capacity and nutrient supply.
#   pH deviation   0.20 - |pH - 6.5|: most field crops do best near neutral; acidity/alkalinity
#                         locks up nutrients.
#   N deficiency   0.20 - nitrogen is the most yield-limiting nutrient in Indian soils.
#   P deficiency   0.15 - P and K matter but are more often corrected by fertiliser and vary
#   K deficiency   0.15   less between districts, so they get lower weights.
# If a component is unavailable (e.g. SoilGrids has no P or K), the remaining weights are
# rescaled to sum to 1 and the components used are recorded in `soil_components_used`.
SOIL_WEIGHTS = {"oc": 0.30, "ph": 0.20, "n": 0.20, "p": 0.15, "k": 0.15}
PH_OPTIMUM = 6.5


def need(path):
    if not path.exists():
        raise SystemExit(f"Missing input {rel(path)} - run  python analysis/01_fetch_data.py  first.")


# =====================================================================================
# 1. Crop data
# =====================================================================================
def _area_factor(unit) -> float:
    """Multiplier to hectares."""
    u = str(unit).lower() if pd.notna(unit) else ""
    return 1000.0 if "1000" in u else 1.0


def _production_to_tonnes(crop_key: str, unit) -> tuple[float | None, str]:
    """Return (multiplier to tonnes, note). None = not convertible to tonnes."""
    u = str(unit).lower() if pd.notna(unit) else ""
    scale = 1000.0 if "1000" in u else 1.0
    if "bale" in u or (not u and crop_key in BALE_KG):
        if crop_key not in BALE_KG:
            return None, "bales_unknown_weight"
        return scale * BALE_KG[crop_key] / 1000.0, f"bales x {BALE_KG[crop_key]} kg"
    if "nut" in u or (not u and crop_key == "coconut"):
        return None, "nuts_not_convertible"
    return scale, "tonnes"


def clean_crop() -> pd.DataFrame:
    log.info("== 1. Crop data")
    need(IN_CROP)
    crop = pd.read_csv(IN_CROP, low_memory=False)
    n0 = len(crop)
    log.info(f"  read {n0:,} rows from {rel(IN_CROP)}")

    unmapped = crop["geo_district"].isna()
    if unmapped.any():
        names = sorted(crop.loc[unmapped, "district"].unique())
        log.warning(f"  dropping {unmapped.sum():,} rows whose district is not confirmed in "
                    f"district_name_map.csv: {names}")
    crop = crop[~unmapped].copy()

    crop["crop_key"] = crop["crop"].map(norm_name)
    if config.CROPS:
        wanted = {norm_name(c) for c in config.CROPS}
        crop = crop[crop["crop_key"].isin(wanted)]
        log.info(f"  crop filter {config.CROPS}: {len(crop):,} rows")
    else:
        log.warning("  config.CROPS is empty - keeping ALL crops. Set CROPS in analysis/config.py.")

    # Season per crop
    overrides = {norm_name(k): v for k, v in config.CROP_SEASON_OVERRIDES.items()}
    season_map = {**CROP_SEASON_DEFAULT, **overrides}
    unknown = sorted(set(crop["crop_key"]) - set(season_map))
    for key in unknown:  # fall back to the season holding most of the reported area
        rows = crop[crop["crop_key"] == key]
        if "season" in rows:
            by = rows.groupby(rows["season"].astype(str).str.strip().str.title())["area"].sum()
            top = by.idxmax() if len(by) else None
            if top in ("Kharif", "Rabi"):
                season_map[key] = top
                log.info(f"  season for '{rows['crop'].iloc[0]}' not predefined -> {top} "
                         f"(largest reported area)")
                continue
        log.warning(f"  no season for crop '{rows['crop'].iloc[0]}' - dropped. Add it to "
                    "config.CROP_SEASON_OVERRIDES to keep it.")
    crop["crop_season"] = crop["crop_key"].map(season_map)
    crop = crop[crop["crop_season"].notna()]

    # Units -> hectares / tonnes
    crop["area_ha"] = crop["area"] * crop.get("area_unit", pd.Series(index=crop.index, dtype=object)).map(_area_factor)
    prod_unit = crop.get("production_unit", pd.Series(index=crop.index, dtype=object))
    conv = [_production_to_tonnes(k, u) for k, u in zip(crop["crop_key"], prod_unit)]
    crop["prod_factor"] = [c[0] if c[0] is not None else np.nan for c in conv]
    crop["prod_note"] = [c[1] for c in conv]
    crop["production_t"] = crop["production"] * crop["prod_factor"]
    for note, n in crop["prod_note"].value_counts().items():
        log.info(f"  production unit handling: {note}: {n:,} rows")
    if "area_unit" not in crop and "production_unit" not in crop:
        log.warning("  no unit columns in crop file - assumed hectares and tonnes "
                    "(data.gov.in convention), bales for cotton/jute/mesta, nuts for coconut")

    # Aggregate seasons -> one row per district x year x crop.
    # Only season rows with BOTH area and production enter the sums, so a missing production
    # figure never silently deflates yield.
    crop["season_clean"] = crop.get("season", pd.Series("", index=crop.index)).astype(str).str.strip().str.title()
    crop["valid"] = crop["area_ha"].notna() & crop["production_t"].notna()
    crop["is_primary"] = crop["season_clean"] == crop["crop_season"]
    keys = ["geo_district", "year", "crop"]
    g = crop.groupby(keys, sort=True)
    agg = pd.DataFrame({
        "season": g["crop_season"].first(),
        "crop_key": g["crop_key"].first(),
        "prod_note": g["prod_note"].first(),
        "area_ha": crop["area_ha"].where(crop["valid"]).groupby([crop[k] for k in keys]).sum(min_count=1),
        "production_t": crop["production_t"].where(crop["valid"]).groupby([crop[k] for k in keys]).sum(min_count=1),
        "primary_area": crop["area_ha"].where(crop["valid"] & crop["is_primary"]).groupby([crop[k] for k in keys]).sum(min_count=1),
        "n_rows_incomplete": (~crop["valid"]).groupby([crop[k] for k in keys]).sum(),
        "seasons_reported": g["season_clean"].agg(lambda s: "|".join(sorted(set(s)))),
    }).reset_index().rename(columns={"geo_district": "district"})
    agg["primary_season_area_share"] = (agg["primary_area"].fillna(0) / agg["area_ha"]).where(agg["area_ha"] > 0)
    log.info(f"  aggregated to {len(agg):,} district-year-crop rows "
             f"({agg['n_rows_incomplete'].gt(0).sum():,} had season rows lacking area or production)")

    # Yield + validity flag (rows are kept; yield is emptied when impossible)
    agg["yield_t_ha"] = agg["production_t"] / agg["area_ha"]
    max_y = agg["crop_key"].map(MAX_YIELD_T_HA).fillna(MAX_YIELD_DEFAULT)
    flag = pd.Series("ok", index=agg.index)
    flag[agg["prod_note"].isin(["nuts_not_convertible", "bales_unknown_weight"])] = "unit_not_convertible"
    flag[(flag == "ok") & (agg["area_ha"].isna() | agg["production_t"].isna())] = "missing_area_or_production"
    flag[(flag == "ok") & (agg["area_ha"] <= 0)] = "nonpositive_area"
    flag[(flag == "ok") & (agg["production_t"] < 0)] = "negative_production"
    flag[(flag == "ok") & (agg["yield_t_ha"] > max_y)] = "exceeds_plausible_max"
    agg["yield_flag"] = flag
    agg.loc[flag != "ok", "yield_t_ha"] = np.nan
    for f, n in flag.value_counts().items():
        log.info(f"  yield_flag {f}: {n:,}")

    # IQR outliers within each district-crop (kept, flagged)
    agg["yield_outlier_iqr"] = pd.Series(pd.NA, index=agg.index, dtype="boolean")
    for _, idx in agg.groupby(["district", "crop"]).groups.items():
        y = agg.loc[idx, "yield_t_ha"].dropna()
        if len(y) < MIN_GROUP_YEARS:
            continue
        q1, q3 = y.quantile([0.25, 0.75])
        lo, hi = q1 - IQR_K * (q3 - q1), q3 + IQR_K * (q3 - q1)
        agg.loc[y.index, "yield_outlier_iqr"] = ~y.between(lo, hi)
    log.info(f"  IQR outliers flagged (kept): {int(agg['yield_outlier_iqr'].sum())}; "
             f"not evaluated (<{MIN_GROUP_YEARS} yrs): {int(agg['yield_outlier_iqr'].isna().sum())}")
    return agg.drop(columns=["primary_area", "prod_note"])


def add_yield_trend(df: pd.DataFrame) -> pd.DataFrame:
    """Linear trend per district-crop, fitted on valid, non-outlier yields only; anomaly for all."""
    log.info("== 4. Yield trend and anomaly")
    df["yield_trend_t_ha"] = np.nan
    n_fit = n_skip = 0
    for _, idx in df.groupby(["district", "crop"]).groups.items():
        sub = df.loc[idx]
        fit = sub[sub["yield_t_ha"].notna() & ~sub["yield_outlier_iqr"].fillna(False).astype(bool)]
        if fit["year"].nunique() < MIN_GROUP_YEARS:
            n_skip += 1
            continue
        slope, intercept = np.polyfit(fit["year"].astype(float), fit["yield_t_ha"], 1)
        df.loc[idx, "yield_trend_t_ha"] = intercept + slope * sub["year"].astype(float)
        n_fit += 1
    df["yield_anomaly_t_ha"] = df["yield_t_ha"] - df["yield_trend_t_ha"]
    df["yield_anomaly_pct"] = (100 * df["yield_anomaly_t_ha"] / df["yield_trend_t_ha"]).where(df["yield_trend_t_ha"] > 0)
    log.info(f"  trend fitted for {n_fit} district-crop series; {n_skip} skipped (<{MIN_GROUP_YEARS} valid years)")
    return df


# =====================================================================================
# 2. Climate -> season features (computation shared with 05_risk via climate.py)
# =====================================================================================
def climate_features(years: list[int]) -> pd.DataFrame:
    log.info("== 2. Climate -> season features")
    need(IN_CLIMATE)
    clim = pd.read_csv(IN_CLIMATE, parse_dates=["date"])
    log.info(f"  read {len(clim):,} daily rows, {clim['district'].nunique()} districts, "
             f"{clim['date'].min().date()} .. {clim['date'].max().date()}")
    na = clim[["PRECTOTCORR", "T2M_MAX", "T2M_MIN", "RH2M"]].isna().sum().to_dict()
    log.info(f"  missing daily values (left missing): {na}")
    feat = climate.season_features(clim, years, climate.fit_spi(clim))
    feat = climate.add_baseline_features(feat, climate.baselines(feat))
    kh = feat["season"] == "Kharif"
    log.info(f"  {len(feat):,} district-season-year rows; incomplete windows "
             f"(<{MIN_COVERAGE:.0%} days): {(feat['climate_coverage'] < MIN_COVERAGE).sum()}; "
             f"Kharif seasons with no onset found by 30 Sep: "
             f"{int((kh & feat['onset_doy'].isna() & feat['rain_mm'].notna()).sum())}")
    return feat


# =====================================================================================
# 3. Soil Degradation Score
# =====================================================================================
SOIL_SOURCES = {  # canonical component -> candidate columns in soil_district.csv
    "oc": ["oc", "oc_g_per_kg"], "ph": ["ph"], "n": ["n", "n_g_per_kg"], "p": ["p"], "k": ["k"],
}


def soil_features() -> tuple[pd.DataFrame, str]:
    log.info("== 3. Soil Degradation Score")
    need(IN_SOIL)
    soil = pd.read_csv(IN_SOIL)
    source = str(soil["source"].iloc[0]) if "source" in soil and len(soil) else "unknown"
    out = pd.DataFrame({"district": soil["geo_district"]})
    for comp, cands in SOIL_SOURCES.items():
        col = next((c for c in cands if c in soil), None)
        out[f"soil_{comp}"] = soil[col] if col else np.nan
    unmatched = out["district"].isna().sum()
    if unmatched:
        log.warning(f"  {unmatched} soil rows have no confirmed map district - dropped")
    # Several source districts can map to one map district (e.g. after a split): average them.
    dup = out["district"].duplicated(keep=False) & out["district"].notna()
    if dup.any():
        log.info(f"  averaging soil values for map districts with several source rows: "
                 f"{sorted(out.loc[dup, 'district'].unique())}")
    out = out.dropna(subset=["district"]).groupby("district", as_index=False).mean(numeric_only=True)

    def scale(x: pd.Series) -> pd.Series:  # min-max to 0..1; constant column -> 0
        rng = x.max() - x.min()
        return (x - x.min()) / rng if rng > 0 else x * 0

    comps = {
        "oc": scale(-out["soil_oc"]),                       # low organic carbon = bad
        "ph": scale((out["soil_ph"] - PH_OPTIMUM).abs()),   # far from 6.5 = bad
        "n": scale(-out["soil_n"]),                         # low N = bad
        "p": scale(-out["soil_p"]),
        "k": scale(-out["soil_k"]),
    }
    avail = [c for c, s in comps.items() if s.notna().any()]
    missing = [c for c in comps if c not in avail]
    if missing:
        log.warning(f"  soil components unavailable: {missing} - weights rescaled over {avail}")
    num = sum(comps[c].fillna(0) * SOIL_WEIGHTS[c] for c in avail)
    den = sum(comps[c].notna() * SOIL_WEIGHTS[c] for c in avail)
    out["soil_degradation_score"] = (num / den).where(den > 0)
    out["soil_components_used"] = [
        "+".join(c for c in avail if pd.notna(comps[c].iloc[i])) for i in range(len(out))]
    out["soil_source"] = source
    log.info(f"  {len(out)} districts scored; score range "
             f"{out['soil_degradation_score'].min():.2f}-{out['soil_degradation_score'].max():.2f}")
    return out, source


# =====================================================================================
# Data dictionary + missing report
# =====================================================================================
def column_docs(soil_source: str) -> dict[str, tuple[str, str]]:
    sg = "SoilGrids" in soil_source
    oc_u, n_u = ("g/kg", "g/kg (total N)") if sg else ("as in source file", "as in source file")
    return {
        "district": ("-", "District name as in the Census 2011 map (datameet)."),
        "year": ("year", "Agricultural year Y (data.gov.in '1997-98' -> 1997)."),
        "crop": ("-", "Crop name as in the crop source file."),
        "season": ("-", "Season assigned to the crop: Kharif = Jun-Oct Y; Rabi = Nov Y - Mar Y+1. Climate features use this window."),
        "crop_key": ("-", "Normalised crop name (lowercase letters only) used for lookups."),
        "area_ha": ("ha", "Crop area summed over all reported seasons (only season rows with both area and production)."),
        "production_t": ("tonnes", "Production summed like area_ha. Bales converted at 170 kg (cotton) / 180 kg (jute, mesta)."),
        "n_rows_incomplete": ("count", "Season rows excluded from the sums because area or production was missing."),
        "seasons_reported": ("-", "Season labels present in the source for this district-year-crop, '|'-separated."),
        "primary_season_area_share": ("0-1", "Share of area_ha reported under the assigned season. Low values mean the climate window covers only part of the crop."),
        "yield_t_ha": ("t/ha", "production_t / area_ha. Empty when yield_flag != 'ok'."),
        "yield_flag": ("-", "ok | missing_area_or_production | nonpositive_area | negative_production | exceeds_plausible_max (crop-specific cap) | unit_not_convertible (e.g. coconut in nuts)."),
        "yield_outlier_iqr": ("bool", f"Yield outside Q1-{IQR_K}*IQR .. Q3+{IQR_K}*IQR within the district-crop series. Kept in data. Empty when the series has <{MIN_GROUP_YEARS} valid years."),
        "yield_trend_t_ha": ("t/ha", f"Linear trend of yield on year per district-crop, fitted on valid non-outlier years (needs >= {MIN_GROUP_YEARS})."),
        "yield_anomaly_t_ha": ("t/ha", "yield_t_ha - yield_trend_t_ha (detrended yield)."),
        "yield_anomaly_pct": ("%", "100 * yield_anomaly_t_ha / yield_trend_t_ha."),
        "climate_coverage": ("0-1", f"Share of days with rainfall data in the season window. Climate features are empty below {MIN_COVERAGE}."),
        "rain_mm": ("mm", "Total rainfall in the season window (NASA POWER PRECTOTCORR)."),
        "rain_anomaly_z": ("z-score", "(rain_mm - district-season mean) / district-season std, over all years in the record."),
        "spi3_mean": ("SPI units", "Mean SPI-3 over 3-month windows lying fully inside the season (Kharif: Jun-Aug, Jul-Sep, Aug-Oct; Rabi: Nov-Jan, Dec-Feb, Jan-Mar). Gamma fit per district x month, whole record. < -1 = moderately dry."),
        "spi3_min": ("SPI units", "Minimum (driest) of the same SPI-3 values."),
        "dry_spell_count": ("count", f"Runs of >= {DRY_SPELL_DAYS} consecutive days with rain < {DRY_DAY_MM} mm inside the season."),
        "onset_doy": ("day of year", "Monsoon onset (Kharif only): first day from 1 Jun with rain >= 2.5 mm, 3-day total >= 20 mm, and no 7-day period < 5 mm in the next 30 days (after Sivakumar 1988). Empty if none by 30 Sep, or Rabi."),
        "onset_delay_days": ("days", "onset_doy minus the district's median onset_doy (positive = late)."),
        "rain_cv_weekly": ("ratio", "Coefficient of variation of 7-day rainfall totals within the season (rainfall unevenness)."),
        "rain_cv_interannual": ("ratio", "Coefficient of variation of seasonal rain_mm across years for the district-season (same for every year)."),
        "heat_stress_days": ("days", f"Days with Tmax > {HEAT_TMAX_C} degC in the season."),
        "gdd_base10": ("degC-days", f"Growing degree days: sum of max(0, (Tmax+Tmin)/2 - {GDD_BASE_C}); no upper cut-off."),
        "tmax_mean_c": ("degC", "Mean daily maximum 2 m temperature in the season."),
        "tmin_mean_c": ("degC", "Mean daily minimum 2 m temperature in the season."),
        "rh_mean_pct": ("%", "Mean 2 m relative humidity in the season."),
        "soil_oc": (oc_u, f"Soil organic carbon ({soil_source}{', 0-30 cm weighted mean' if sg else ''})."),
        "soil_ph": ("pH", f"Soil pH in water ({soil_source})."),
        "soil_n": (n_u, f"Soil nitrogen ({soil_source})."),
        "soil_p": ("as in source file", "Available phosphorus. Not available from SoilGrids (empty)."),
        "soil_k": ("as in source file", "Available potassium. Not available from SoilGrids (empty)."),
        "soil_degradation_score": ("0-1", "Weighted mean of min-max scaled components: low OC 0.30, |pH-6.5| 0.20, low N 0.20, low P 0.15, low K 0.15; weights rescaled over available components. Relative within the study area (1 = most degraded district)."),
        "soil_components_used": ("-", "Components that entered the score for this district."),
        "soil_source": ("-", "Source of the soil values."),
    }


MISSING_HANDLING = {
    "yield_t_ha": "left empty; reason in yield_flag; excluded from trend fit",
    "yield_outlier_iqr": f"not evaluated: district-crop series < {MIN_GROUP_YEARS} valid years",
    "yield_trend_t_ha": f"left empty: < {MIN_GROUP_YEARS} valid non-outlier years",
    "yield_anomaly_t_ha": "empty where yield or trend is empty",
    "yield_anomaly_pct": "empty where yield or trend is empty (or trend <= 0)",
    "primary_season_area_share": "empty where area_ha is empty or 0",
    "area_ha": "no season row had both area and production",
    "production_t": "no season row had both area and production / unit not convertible",
    "onset_doy": "Rabi rows (not applicable) or no onset found by 30 Sep (possible failed/late monsoon)",
    "onset_delay_days": "empty where onset_doy is empty",
    "spi3_mean": "too few non-zero 3-month totals to fit gamma, or incomplete months",
    "spi3_min": "as spi3_mean",
    "rain_cv_weekly": "season with zero rain",
    "soil_p": "not in soil source (SoilGrids has no P)",
    "soil_k": "not in soil source (SoilGrids has no K)",
    "soil_degradation_score": "no soil data for district",
}
CLIMATE_COLS = ["climate_coverage", "rain_mm", "rain_anomaly_z", "spi3_mean", "spi3_min", "dry_spell_count",
                "onset_doy", "onset_delay_days", "rain_cv_weekly", "rain_cv_interannual",
                "heat_stress_days", "gdd_base10", "tmax_mean_c", "tmin_mean_c", "rh_mean_pct"]


def missing_report(df: pd.DataFrame) -> None:
    log.info("== 6. Missing-value report (nothing imputed)")
    rows = []
    for c in df.columns:
        n = int(df[c].isna().sum())
        if not n:
            continue
        how = MISSING_HANDLING.get(c)
        if how is None and c in CLIMATE_COLS:
            how = f"climate window < {MIN_COVERAGE:.0%} complete, or no climate for district/year"
        if how is None and c.startswith("soil_"):
            how = "no soil value for district"
        rows.append((c, n, f"{100 * n / len(df):.1f}%", how or "left empty"))
    if rows:
        rep = pd.DataFrame(rows, columns=["column", "missing", "pct", "handling"])
        log.info("\n" + rep.to_string(index=False))
    else:
        log.info("  no missing values")


def write_dictionary(df: pd.DataFrame, docs: dict) -> None:
    undocumented = [c for c in df.columns if c not in docs]
    if undocumented:
        raise RuntimeError(f"columns missing from data dictionary: {undocumented}")
    lines = [
        "# Data dictionary - `data/processed/master.csv`",
        "",
        "Generated by `analysis/02_features.py`. One row = district x agricultural year x crop.",
        f"Rows: {len(df):,} | districts: {df['district'].nunique()} | crops: {df['crop'].nunique()} | "
        f"years: {df['year'].min()}-{df['year'].max()}",
        "",
        "Sources: crop statistics (manual file, see README), NASA POWER daily climate at district "
        "centroids, soil from " + str(df["soil_source"].dropna().iloc[0] if df["soil_source"].notna().any() else "-") + ".",
        "No values are imputed; empty cells are explained in the missing-value report printed by the script.",
        "",
        "| Column | Unit | Description |",
        "|---|---|---|",
    ]
    for c in df.columns:
        unit, desc = docs[c]
        lines.append(f"| `{c}` | {unit} | {desc} |")
    OUT_DICT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log.info(f"  data dictionary -> {rel(OUT_DICT)}")


# =====================================================================================
def main() -> int:
    log.info(f"KrishiRisk 02_features | years={config.YEAR_START}-{config.year_end()}")
    crop = clean_crop()
    years = sorted(int(y) for y in crop["year"].unique())
    clim = climate_features(years)
    soil, soil_source = soil_features()
    crop = add_yield_trend(crop)

    log.info("== 5. Merge")
    master = crop.merge(clim, on=["district", "year", "season"], how="left", validate="many_to_one")
    master = master.merge(soil, on="district", how="left", validate="many_to_one")
    no_clim = master["climate_coverage"].isna().sum()
    if no_clim:
        log.warning(f"  {no_clim} rows have no climate record for their district/year")
    order = list(column_docs(soil_source))
    master = master[[c for c in order if c in master.columns]]
    master = master.sort_values(["district", "crop", "year"]).reset_index(drop=True)
    master.to_csv(OUT_MASTER, index=False, float_format="%.4f")
    log.info(f"  master: {len(master):,} rows x {master.shape[1]} cols -> {rel(OUT_MASTER)}")

    missing_report(master)
    write_dictionary(master, column_docs(soil_source))
    log.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
