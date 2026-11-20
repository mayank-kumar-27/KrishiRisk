"""03 - Exploratory figures for the report + computed interpretations.

Inputs   data/processed/master.csv, data/processed/districts.geojson,
         data/raw/climate/climate_daily.csv
Outputs  report/figures/fig01_..fig08_*.png  (300 dpi)
         report/figures/insights.md          (2-3 lines per figure, numbers computed here)

Design rules: colourblind-safe palette (validated), one y-axis per panel, thin marks, solid
hairline grids, every axis labelled with units, titles that state the finding. No 3D, no pies.
Statistics are descriptive: district-years are not independent samples, so p-values are
indicative only (stated in insights.md).

Usage:  python analysis/03_eda.py
"""
from __future__ import annotations

import sys
import warnings

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap, TwoSlopeNorm  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from scipy import stats  # noqa: E402

from common import FIGURES, PROCESSED, RAW_CLIMATE, get_logger, rel  # noqa: E402

log = get_logger("03_eda")
warnings.filterwarnings("ignore", category=RuntimeWarning)

IN_MASTER = PROCESSED / "master.csv"
IN_GEO = PROCESSED / "districts.geojson"
IN_CLIMATE = RAW_CLIMATE / "climate_daily.csv"
OUT_INSIGHTS = FIGURES / "insights.md"
MAX_CROPS = 6        # small-multiple panels; further crops are listed in insights.md but not plotted
MIN_ROWS_PLOT = 20   # a crop needs this many valid district-years to be plotted

# ---- Palette (validated: CVD dE >= 8.7, normal-vision dE >= 17.8 on white, all pairs) -------
INK, INK2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, AXIS = "#e1e0d9", "#c3c2b7"
BLUE, BLUE_LIGHT = "#2a78d6", "#86b6ef"
# Rainfall classes are polar (dry <-> wet): diverging poles + neutral gray midpoint,
# with marker shape as the secondary (non-colour) encoding.
RAIN_CLASS = {
    "Drought": dict(color="#e34948", marker="v"),
    "Normal": dict(color=MUTED, marker="o"),
    "Excess": dict(color=BLUE, marker="^"),
}
SEQ_BLUE = LinearSegmentedColormap.from_list(
    "seq_blue", ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"])
DIVERGING = LinearSegmentedColormap.from_list(  # red (negative) - gray - blue (positive)
    "div_rb", ["#a32f2f", "#e34948", "#f4a9a8", "#f0efec", "#9ec5f4", "#3987e5", "#184f95"])

SPI_DRY, SPI_WET = -1.0, 1.0      # McKee et al.: SPI <= -1 moderately dry, >= +1 moderately wet
DEP_DEFICIT, DEP_EXCESS = -20, 20  # IMD rainfall categories: departure from normal, %

CLIMATE_FEATURES = {
    "rain_mm": "Seasonal rainfall", "rain_anomaly_z": "Rainfall anomaly (z)",
    "spi3_mean": "SPI-3 (mean)", "spi3_min": "SPI-3 (driest)", "dry_spell_count": "Dry spells (>=7 d)",
    "onset_delay_days": "Monsoon onset delay", "rain_cv_weekly": "Rainfall CV (weekly)",
    "heat_stress_days": "Heat-stress days (>35 degC)", "gdd_base10": "Growing degree days",
    "tmax_mean_c": "Mean Tmax", "tmin_mean_c": "Mean Tmin", "rh_mean_pct": "Mean rel. humidity",
}
SOIL_FEATURES = {"soil_degradation_score": "Soil degradation score", "soil_oc": "Organic carbon",
                 "soil_ph": "pH", "soil_n": "Nitrogen", "soil_p": "Phosphorus", "soil_k": "Potassium"}

INSIGHTS: list[str] = []


# =====================================================================================
# Helpers
# =====================================================================================
def style() -> None:
    plt.rcParams.update({
        "figure.dpi": 100, "savefig.dpi": 300, "figure.facecolor": "white", "axes.facecolor": "white",
        "font.family": "sans-serif", "font.sans-serif": ["Segoe UI", "Helvetica", "Arial", "DejaVu Sans"],
        "font.size": 9, "axes.titlesize": 10, "axes.titleweight": "regular", "axes.labelsize": 9,
        "axes.labelcolor": INK2, "axes.edgecolor": AXIS, "axes.linewidth": 0.6,
        "axes.spines.top": False, "axes.spines.right": False,
        "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.5, "grid.linestyle": "-",
        "axes.axisbelow": True, "xtick.color": MUTED, "ytick.color": MUTED,
        "xtick.labelcolor": INK2, "ytick.labelcolor": INK2, "xtick.major.size": 0, "ytick.major.size": 0,
        "legend.frameon": False, "legend.fontsize": 8, "lines.linewidth": 1.5, "text.color": INK,
    })


def fmt_p(p: float) -> str:
    if pd.isna(p):
        return "p = n/a"
    return "p < 0.001" if p < 0.001 else f"p = {p:.3f}"


def headline(fig, title: str, subtitle: str) -> None:
    h = fig.get_figheight()  # place in inches so spacing is the same for every figure size
    fig.suptitle(title, x=0.01, ha="left", va="top", fontsize=12, fontweight="bold", color=INK, y=1 - 0.05 / h)
    fig.text(0.01, 1 - 0.32 / h, subtitle, ha="left", va="top", fontsize=9, color=INK2)


def grid_axes(n: int, ncols: int = 3, w: float = 3.4, h: float = 2.8, **kw):
    ncols = min(ncols, n)
    nrows = int(np.ceil(n / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(w * ncols, h * nrows + 0.6), squeeze=False, **kw)
    for ax in axes.flat[n:]:
        ax.set_visible(False)
    return fig, list(axes.flat[:n])


def save(fig, name: str) -> str:
    fig.tight_layout(rect=(0, 0, 1, 1 - 0.6 / fig.get_figheight()))
    path = FIGURES / name
    fig.savefig(path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    log.info(f"  saved {rel(path)}")
    return name


def note(num: int, name: str, title: str, lines: list[str]) -> None:
    INSIGHTS.append(f"## {num}. {title}\n\n![{title}]({name})\n\n" + "\n".join(f"- {l}" for l in lines) + "\n")


def linfit(x, y):
    m = pd.notna(x) & pd.notna(y)
    if m.sum() < 3 or np.unique(x[m]).size < 2:
        return None
    return stats.linregress(x[m].astype(float), y[m].astype(float))


# =====================================================================================
# Figures
# =====================================================================================
def fig_trend(valid: pd.DataFrame, crops: list[str]) -> None:
    st = valid.groupby(["crop", "year"]).agg(p=("production_t", "sum"), a=("area_ha", "sum"),
                                             n=("district", "nunique")).reset_index()
    st["y"] = st["p"] / st["a"]  # area-weighted state yield
    fig, axes = grid_axes(len(crops))
    rows = []
    for ax, crop in zip(axes, crops):
        s = st[st["crop"] == crop].sort_values("year")
        roll = s["y"].rolling(5, center=True, min_periods=3).mean()
        ax.plot(s["year"], s["y"], color=BLUE_LIGHT, lw=1, marker="o", ms=3, label="Annual")
        ax.plot(s["year"], roll, color=BLUE, lw=2, label="5-yr rolling mean")
        fit = linfit(s["year"], s["y"])
        pct = 100 * fit.slope / s["y"].mean() if fit else np.nan
        rows.append((crop, pct, fit.pvalue if fit else np.nan, s["year"].min(), s["year"].max(),
                     s["y"].iloc[0], s["y"].iloc[-1]))
        ax.set_title(f"{crop}: {pct:+.1f}%/yr ({fmt_p(fit.pvalue if fit else np.nan)})", loc="left")
        ax.set_xlabel("Agricultural year")
        ax.set_ylabel("Yield (t/ha)")
    axes[0].legend(loc="upper left")
    r = pd.DataFrame(rows, columns=["crop", "pct", "p", "y0", "y1", "v0", "v1"])
    up = r[(r["pct"] > 0) & (r["p"] < 0.05)]
    best = r.loc[r["pct"].idxmax()]
    title = (f"{len(up)} of {len(r)} crops show a significant upward yield trend"
             + (f"; {best['crop']} rose fastest ({best['pct']:+.1f}%/yr)" if len(up) else ""))
    headline(fig, title, "State yield = total production / total area of reporting districts; "
                         "thick line = 5-year centred rolling mean")
    name = save(fig, "fig01_yield_trend.png")
    lines = [f"{x.crop}: {x.v0:.2f} -> {x.v1:.2f} t/ha ({int(x.y0)}-{int(x.y1)}), linear trend "
             f"{x.pct:+.2f}%/yr of mean yield ({fmt_p(x.p)})." for x in r.itertuples()]
    flat = r[r["p"] >= 0.05]["crop"].tolist()
    if flat:
        lines.append(f"No significant trend (p >= 0.05) for: {', '.join(flat)} - year-to-year "
                     "variation dominates any long-term gain.")
    note(1, name, title, lines)


def fig_rain_scatter(valid: pd.DataFrame, crops: list[str]) -> None:
    d = valid.dropna(subset=["rain_mm", "spi3_mean"]).copy()
    d["cls"] = np.select([d["spi3_mean"] <= SPI_DRY, d["spi3_mean"] >= SPI_WET],
                         ["Drought", "Excess"], "Normal")
    fig, axes = grid_axes(len(crops))
    lines, rs = [], []
    for ax, crop in zip(axes, crops):
        s = d[d["crop"] == crop]
        for cls, kw in RAIN_CLASS.items():
            c = s[s["cls"] == cls]
            ax.scatter(c["rain_mm"], c["yield_t_ha"], s=26, color=kw["color"], marker=kw["marker"],
                       edgecolor="white", linewidth=0.5, alpha=0.85, label=f"{cls} (n={len(c)})")
        fit = linfit(s["rain_mm"], s["yield_t_ha"])
        if fit:
            xs = np.linspace(s["rain_mm"].min(), s["rain_mm"].max(), 50)
            ax.plot(xs, fit.intercept + fit.slope * xs, color=INK, lw=1.5)
            rs.append((crop, fit.rvalue, fit.pvalue, len(s)))
        r_an = s[["rain_mm", "yield_anomaly_pct"]].dropna()
        ra = stats.pearsonr(r_an.iloc[:, 0], r_an.iloc[:, 1]) if len(r_an) > 3 else (np.nan, np.nan)
        md = s.groupby("cls")["yield_anomaly_pct"].median()
        ax.set_title(f"{crop}: r = {fit.rvalue:.2f} ({fmt_p(fit.pvalue)})" if fit else crop, loc="left")
        ax.set_xlabel("Seasonal rainfall (mm)")
        ax.set_ylabel("Yield (t/ha)")
        ax.legend(loc="best", fontsize=7, handletextpad=0.2)
        lines.append(
            f"{crop}: rainfall vs yield r = {fit.rvalue:.2f} ({fmt_p(fit.pvalue)}, n = {len(s)}); "
            f"vs detrended yield anomaly r = {ra[0]:.2f} ({fmt_p(ra[1])}). Median yield anomaly: "
            + ", ".join(f"{k} {md.get(k, np.nan):+.1f}%" for k in RAIN_CLASS) + "." if fit else f"{crop}: too few points.")
    strongest = max(rs, key=lambda t: abs(t[1])) if rs else None
    title = (f"Seasonal rainfall explains little of yield across district-years; strongest link: "
             f"{strongest[0]} (r = {strongest[1]:.2f})" if strongest and abs(strongest[1]) < 0.3 else
             f"Seasonal rainfall is linked to yield; strongest for {strongest[0]} (r = {strongest[1]:.2f})"
             if strongest else "Rainfall vs yield")
    headline(fig, title, f"Each point = one district-year. Drought: SPI-3 <= {SPI_DRY:g}; "
                         f"excess: SPI-3 >= {SPI_WET:g}. Black line = least-squares fit")
    name = save(fig, "fig02_rainfall_vs_yield.png")
    lines.append("Raw yield mixes districts with very different yield levels; the detrended anomaly "
                 "correlation isolates the year-to-year rainfall effect.")
    note(2, name, title, lines)


def _corr(x, y, min_n):
    m = pd.notna(x) & pd.notna(y)
    if m.sum() < min_n or x[m].nunique() < 2 or y[m].nunique() < 2:
        return np.nan, np.nan, int(m.sum())
    r, p = stats.pearsonr(x[m], y[m])
    return r, p, int(m.sum())


def fig_corr(valid: pd.DataFrame, crops: list[str]) -> None:
    cols = crops + ["All crops"]
    clim = [f for f in CLIMATE_FEATURES if f in valid and valid[f].notna().any()]
    soil = [f for f in SOIL_FEATURES if f in valid and valid[f].notna().any()]
    R1 = pd.DataFrame(np.nan, index=clim, columns=cols); P1 = R1.copy()
    R2 = pd.DataFrame(np.nan, index=soil, columns=cols); P2 = R2.copy()
    for c in cols:
        s = valid if c == "All crops" else valid[valid["crop"] == c]
        for f in clim:
            R1.loc[f, c], P1.loc[f, c], _ = _corr(s[f], s["yield_anomaly_pct"], 10)
        dm = s.groupby(["district", "crop"]).agg(y=("yield_t_ha", "mean"),
                                                 **{f: (f, "first") for f in soil}).reset_index()
        if c == "All crops":  # standardise per crop so crops with big yields don't dominate
            dm["y"] = dm.groupby("crop")["y"].transform(lambda v: (v - v.mean()) / v.std())
        for f in soil:
            R2.loc[f, c], P2.loc[f, c], _ = _corr(dm[f], dm["y"], 5)

    vmax = max(0.3, float(np.nanmax(np.abs(np.r_[R1.values.ravel(), R2.values.ravel()]))))
    vmax = np.ceil(vmax * 10) / 10
    norm = TwoSlopeNorm(vcenter=0, vmin=-vmax, vmax=vmax)
    h1, h2 = len(clim), max(len(soil), 1)
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(0.9 * len(cols) + 4.2, 0.32 * (h1 + h2) + 2.6),
                                 height_ratios=[h1, h2], layout="constrained")
    for ax, R, P, labels, sub in ((a1, R1, P1, CLIMATE_FEATURES, "A. Season climate vs detrended yield anomaly (%)"),
                                  (a2, R2, P2, SOIL_FEATURES, "B. Soil vs district mean yield (across districts)")):
        if R.empty:
            ax.set_visible(False)
            continue
        im = ax.imshow(R.values.astype(float), cmap=DIVERGING, norm=norm, aspect="auto")
        ax.set_xticks(range(len(cols)), cols, rotation=30, ha="right")
        ax.set_yticks(range(len(R)), [labels[i] for i in R.index])
        ax.grid(False)
        for s_ in ax.spines.values():
            s_.set_visible(False)
        for i in range(R.shape[0]):  # label only significant cells
            for j in range(R.shape[1]):
                r, p = R.iat[i, j], P.iat[i, j]
                if pd.notna(p) and p < 0.05:
                    ax.text(j, i, f"{r:.2f}", ha="center", va="center", fontsize=7,
                            color="white" if abs(r) > 0.6 * vmax else INK)
        ax.set_title(sub, loc="left", fontsize=9, color=INK2)
    cb = fig.colorbar(im, ax=[a1, a2], shrink=0.5)
    cb.set_label("Pearson r  (blue: higher value, higher yield;\nred: lower yield; labelled where p < 0.05)")
    cb.outline.set_visible(False)

    flat = [(f, c, R1.loc[f, c], P1.loc[f, c]) for f in clim for c in cols if pd.notna(R1.loc[f, c])]
    flat.sort(key=lambda t: -abs(t[2]))
    sig = [t for t in flat if t[3] < 0.05]
    top = flat[0] if flat else None
    if top and top[3] < 0.05:
        title = (f"{CLIMATE_FEATURES[top[0]]} is the strongest climate correlate of yield anomaly\n"
                 f"({top[1]}, r = {top[2]:.2f}, {fmt_p(top[3])})")
    else:
        title = "No climate feature correlates significantly with yield anomaly"
    fig.suptitle(title, x=0.02, ha="left", fontsize=12, fontweight="bold")
    path = FIGURES / "fig03_correlation_heatmap.png"
    fig.savefig(path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    log.info(f"  saved {rel(path)}")
    lines = [f"{len(sig)} of {len(flat)} climate-feature x crop correlations are significant at p < 0.05."]
    lines += [f"{CLIMATE_FEATURES[f]} - {c}: r = {r:.2f} ({fmt_p(p)})" for f, c, r, p in flat[:5]]
    sflat = sorted([(f, c, R2.loc[f, c], P2.loc[f, c]) for f in soil for c in cols
                    if pd.notna(R2.loc[f, c])], key=lambda t: -abs(t[2]))
    if sflat:
        f, c, r, p = sflat[0]
        lines.append(f"Soil: strongest is {SOIL_FEATURES[f]} vs mean yield for {c}, r = {r:.2f} ({fmt_p(p)}), "
                     "computed across districts (small n; treat as indicative).")
    note(3, "fig03_correlation_heatmap.png", title.replace("\n", " "), lines)


def fig_box(valid: pd.DataFrame, crops: list[str]) -> None:
    base = valid.drop_duplicates(["district", "season", "year"]).groupby(["district", "season"])["rain_mm"].mean()
    d = valid.join(base.rename("rain_normal"), on=["district", "season"]).dropna(subset=["rain_mm", "yield_anomaly_pct"])
    d["dep"] = 100 * (d["rain_mm"] / d["rain_normal"] - 1)
    d["cls"] = np.select([d["dep"] <= DEP_DEFICIT, d["dep"] >= DEP_EXCESS], ["Deficit", "Excess"], "Normal")
    order = ["Deficit", "Normal", "Excess"]
    colors = [RAIN_CLASS["Drought"]["color"], MUTED, BLUE]
    fig, axes = grid_axes(len(crops), h=3.0)
    lines, gaps = [], []
    for ax, crop in zip(axes, crops):
        s = d[d["crop"] == crop]
        data = [s.loc[s["cls"] == c, "yield_anomaly_pct"].values for c in order]
        bp = ax.boxplot([x if len(x) else [np.nan] for x in data], widths=0.5, patch_artist=True,
                        showfliers=True, medianprops=dict(color=INK, lw=1.5),
                        flierprops=dict(marker="o", ms=3, mfc=MUTED, mec="none", alpha=0.6),
                        whiskerprops=dict(color=MUTED), capprops=dict(color=MUTED))
        for patch, col in zip(bp["boxes"], colors):
            patch.set(facecolor=col, alpha=0.35, edgecolor=col, linewidth=1)
        ax.set_xticks([1, 2, 3], [f"{c}\n(n={len(x)})" for c, x in zip(order, data)])
        ax.axhline(0, color=AXIS, lw=0.8)
        ax.set_ylabel("Yield anomaly vs trend (%)")
        groups = [x for x in data if len(x) >= 3]
        kw = stats.kruskal(*groups) if len(groups) >= 2 else None
        med = {c: np.median(x) if len(x) else np.nan for c, x in zip(order, data)}
        ax.set_title(f"{crop}: Kruskal-Wallis {fmt_p(kw.pvalue) if kw else 'n/a'}", loc="left")
        mw = (stats.mannwhitneyu(data[0], data[1]) if len(data[0]) >= 3 and len(data[1]) >= 3 else None)
        gaps.append((crop, med["Deficit"] - med["Normal"], mw.pvalue if mw else np.nan))
        lines.append(f"{crop}: median anomaly deficit {med['Deficit']:+.1f}%, normal {med['Normal']:+.1f}%, "
                     f"excess {med['Excess']:+.1f}%; Kruskal-Wallis {fmt_p(kw.pvalue) if kw else 'n/a'}; "
                     f"deficit vs normal Mann-Whitney {fmt_p(mw.pvalue) if mw else 'n/a'}.")
    sig = [x for x in gaps if pd.notna(x[1]) and x[1] < 0 and x[2] < 0.05]
    if sig:
        worst = min(sig, key=lambda t: t[1])
        title = (f"Rainfall-deficit years cut yields for {len(sig)} of {len(gaps)} crops; "
                 f"{worst[0]} median {worst[1]:+.1f} pts vs normal years")
    else:
        title = "No crop shows a significant yield penalty in rainfall-deficit years"
    headline(fig, title, f"Deficit/excess = seasonal rain <= {DEP_DEFICIT}% / >= +{DEP_EXCESS}% of the "
                         "district's long-term mean (IMD categories). Yield detrended per district-crop")
    name = save(fig, "fig04_yield_by_rain_category.png")
    lines.append("Detrended anomalies are used so district yield levels and technology trends do not mask the rainfall effect.")
    note(4, name, title, lines)


def fig_month_heatmap() -> None:
    clim = pd.read_csv(IN_CLIMATE, usecols=["date", "district", "PRECTOTCORR"], parse_dates=["date"])
    clim["y"], clim["m"] = clim["date"].dt.year, clim["date"].dt.month
    days = clim.groupby("y")["date"].nunique()
    full = days[days >= 365].index
    mon = clim[clim["y"].isin(full)].groupby(["district", "y", "m"])["PRECTOTCORR"].sum().groupby(["y", "m"]).mean()
    M = mon.unstack("y")  # months x years, state mean of district totals
    fig, ax = plt.subplots(figsize=(max(7, 0.28 * M.shape[1] + 2), 4.2))
    im = ax.imshow(M.values, cmap=SEQ_BLUE, aspect="auto")
    ax.set_yticks(range(12), ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
    step = 2 if M.shape[1] > 15 else 1
    ax.set_xticks(range(0, M.shape[1], step), M.columns[::step], rotation=90)
    ax.set_xlabel("Year"); ax.set_ylabel("Month"); ax.grid(False)
    for s_ in ax.spines.values():
        s_.set_visible(False)
    cb = fig.colorbar(im, ax=ax, shrink=0.8, pad=0.01); cb.set_label("Rainfall (mm/month, district mean)")
    cb.outline.set_visible(False)
    annual = M.sum(axis=0)
    jjas = 100 * M.loc[6:9].sum().sum() / M.values.sum()
    wettest_m = M.mean(axis=1).idxmax()
    fit = linfit(pd.Series(annual.index), pd.Series(annual.values))
    title = f"The June-September monsoon delivers {jjas:.0f}% of annual rainfall"
    headline(fig, title, f"Monthly rainfall averaged over districts, {M.columns.min()}-{M.columns.max()} (NASA POWER)")
    name = save(fig, "fig05_monthly_rainfall_heatmap.png")
    mn = pd.Timestamp(2000, int(wettest_m), 1).strftime("%B")
    note(5, name, title, [
        f"JJAS share of annual rain: {jjas:.1f}%; wettest month on average: {mn} ({M.loc[wettest_m].mean():.0f} mm).",
        f"Annual rain ranged from {annual.min():.0f} mm ({annual.idxmin()}) to {annual.max():.0f} mm "
        f"({annual.idxmax()}); mean {annual.mean():.0f} mm, CV {annual.std() / annual.mean():.2f}.",
        f"Linear trend in annual rainfall: {fit.slope:+.1f} mm/yr ({fmt_p(fit.pvalue)})." if fit else "Trend: n/a.",
    ])


def fig_violin(valid: pd.DataFrame, crops: list[str]) -> None:
    data = [valid.loc[valid["crop"] == c, "yield_t_ha"].dropna().values for c in crops]
    meds = [np.median(x) for x in data]
    log_x = max(meds) / max(min(meds), 1e-6) > 8
    fig, ax = plt.subplots(figsize=(7.5, 0.7 * len(crops) + 1.6))
    vp = ax.violinplot(data, vert=False, showextrema=False, widths=0.8)
    for b in vp["bodies"]:
        b.set(facecolor=BLUE, edgecolor=BLUE, alpha=0.3, linewidth=0.8)
    for i, x in enumerate(data, 1):
        q1, q2, q3 = np.percentile(x, [25, 50, 75])
        ax.plot([q1, q3], [i, i], color=BLUE, lw=3, solid_capstyle="round")
        ax.plot(q2, i, "o", color="white", mec=INK, ms=5)
    ax.set_yticks(range(1, len(crops) + 1), crops)
    ax.invert_yaxis()
    if log_x:
        ax.set_xscale("log")
    ax.set_xlabel("Yield (t/ha" + (", log scale)" if log_x else ")"))
    ax.grid(axis="y", visible=False)
    cv = {c: np.std(x) / np.mean(x) for c, x in zip(crops, data)}
    most = max(cv, key=cv.get)
    title = f"{most} has the most variable yields (CV = {cv[most]:.2f}) across districts and years"
    headline(fig, title, "Distribution of district-year yields; bar = interquartile range, dot = median")
    name = save(fig, "fig06_yield_distribution.png")
    note(6, name, title, [
        f"{c}: median {np.median(x):.2f} t/ha, IQR {np.percentile(x, 25):.2f}-{np.percentile(x, 75):.2f}, "
        f"CV {cv[c]:.2f}, n = {len(x)}." for c, x in zip(crops, data)
    ] + [f"Lowest relative variability: {min(cv, key=cv.get)} (CV = {min(cv.values()):.2f})."])


def fig_map(valid: pd.DataFrame, crops: list[str]) -> None:
    geo = gpd.read_file(IN_GEO)
    fig, axes = grid_axes(len(crops), w=3.6, h=3.6)
    lines, ratios = [], []
    for ax, crop in zip(axes, crops):
        mean = valid[valid["crop"] == crop].groupby("district")["yield_t_ha"].mean()
        g = geo.merge(mean.rename("y"), left_on="district", right_index=True, how="left")
        g.plot(column="y", ax=ax, cmap=SEQ_BLUE, edgecolor="white", linewidth=0.6, legend=True,
               legend_kwds={"orientation": "horizontal", "shrink": 0.7, "pad": 0.02, "label": "Mean yield (t/ha)"},
               missing_kwds={"color": "#f0efec", "edgecolor": "white", "hatch": "///", "label": "No data"})
        ax.set_axis_off()
        ax.set_title(crop, loc="left")
        m = mean.dropna()
        if len(m) >= 2:
            ratios.append((crop, m.idxmax(), m.max(), m.idxmin(), m.min()))
            lines.append(f"{crop}: highest {m.idxmax()} ({m.max():.2f} t/ha), lowest {m.idxmin()} "
                         f"({m.min():.2f} t/ha) - {100 * (m.max() / m.min() - 1):.0f}% higher; "
                         f"{g['y'].isna().sum()} of {len(g)} districts without data.")
    big = max(ratios, key=lambda t: t[2] / t[4]) if ratios else None
    title = (f"{big[0]} yields are {100 * (big[2] / big[4] - 1):.0f}% higher in {big[1]} than in {big[3]}"
             if big else "Mean yield by district")
    headline(fig, title, "Mean of all valid years per district; hatched = no data. Census 2011 boundaries")
    name = save(fig, "fig07_district_yield_map.png")
    note(7, name, title, lines)


def fig_dry_spells(valid: pd.DataFrame, crops: list[str]) -> None:
    d = valid.dropna(subset=["dry_spell_count", "yield_anomaly_pct"])
    rng = np.random.default_rng(0)  # jitter only - fixed seed so the figure is reproducible
    fig, axes = grid_axes(len(crops))
    lines, res = [], []
    for ax, crop in zip(axes, crops):
        s = d[d["crop"] == crop]
        ax.scatter(s["dry_spell_count"] + rng.uniform(-0.18, 0.18, len(s)), s["yield_anomaly_pct"],
                   s=16, color=BLUE, alpha=0.45, edgecolor="white", linewidth=0.4)
        means = s.groupby("dry_spell_count")["yield_anomaly_pct"].mean()
        ax.plot(means.index, means.values, "D", color=INK, ms=5, label="Mean per count")
        fit = linfit(s["dry_spell_count"], s["yield_anomaly_pct"])
        rho = stats.spearmanr(s["dry_spell_count"], s["yield_anomaly_pct"]) if len(s) > 3 else None
        if fit:
            xs = np.array([s["dry_spell_count"].min(), s["dry_spell_count"].max()])
            ax.plot(xs, fit.intercept + fit.slope * xs, color=INK, lw=1.5)
            res.append((crop, fit.slope, rho.statistic, rho.pvalue))
        ax.axhline(0, color=AXIS, lw=0.8)
        ax.set_title(f"{crop}: rho = {rho.statistic:.2f} ({fmt_p(rho.pvalue)})" if rho else crop, loc="left")
        ax.set_xlabel("Dry spells in season (count, >=7 days < 2.5 mm)")
        ax.set_ylabel("Yield anomaly vs trend (%)")
        if fit:
            lines.append(f"{crop}: each extra dry spell goes with a {fit.slope:+.1f} pt change in yield anomaly "
                         f"(OLS); Spearman rho = {rho.statistic:.2f} ({fmt_p(rho.pvalue)}), n = {len(s)}.")
    axes[0].legend(loc="upper right")
    neg = [r for r in res if r[1] < 0 and r[3] < 0.05]
    if neg:
        worst = min(neg, key=lambda t: t[1])
        title = (f"More dry spells, lower yields for {len(neg)} of {len(res)} crops "
                 f"({worst[0]}: {worst[1]:+.1f} pts per extra spell)")
    else:
        title = f"Dry-spell count shows no significant link to yield anomaly ({len(res)} crops tested)"
    headline(fig, title, "Points jittered horizontally; diamonds = mean anomaly at each count; line = least-squares fit")
    name = save(fig, "fig08_dry_spells_vs_yield.png")
    note(8, name, title, lines)


# =====================================================================================
def main() -> int:
    for p in (IN_MASTER, IN_GEO, IN_CLIMATE):
        if not p.exists():
            log.error(f"Missing {rel(p)} - run 01_fetch_data.py and 02_features.py first.")
            return 1
    style()
    FIGURES.mkdir(parents=True, exist_ok=True)
    m = pd.read_csv(IN_MASTER)
    valid = m[(m["yield_flag"] == "ok") & m["yield_t_ha"].notna()].copy()
    log.info(f"KrishiRisk 03_eda | {len(valid):,} valid district-year-crop rows of {len(m):,}")
    counts = valid.groupby("crop").size()
    sparse = sorted(counts[counts < MIN_ROWS_PLOT].index)
    if sparse:
        log.warning(f"  not plotted (< {MIN_ROWS_PLOT} valid district-years): {sparse}")
    crops = (valid[~valid["crop"].isin(sparse)].groupby("crop")["area_ha"].sum()
             .sort_values(ascending=False).index.tolist())
    if not crops:
        log.error(f"No crop has >= {MIN_ROWS_PLOT} valid district-years - nothing to plot.")
        return 1
    if len(crops) > MAX_CROPS:
        log.warning(f"  {len(crops)} crops - plotting the {MAX_CROPS} largest by area: {crops[:MAX_CROPS]}")
    plotted = crops[:MAX_CROPS]
    skipped = crops[MAX_CROPS:] + sparse

    for f, args in ((fig_trend, (valid, plotted)), (fig_rain_scatter, (valid, plotted)),
                    (fig_corr, (valid, plotted)), (fig_box, (valid, plotted)), (fig_month_heatmap, ()),
                    (fig_violin, (valid, plotted)), (fig_map, (valid, plotted)), (fig_dry_spells, (valid, plotted))):
        log.info(f"== {f.__name__}")
        f(*args)

    INSIGHTS.sort(key=lambda s: int(s.split(".")[0][3:]))
    header = ("# KrishiRisk - EDA insights\n\nGenerated by `analysis/03_eda.py` from `data/processed/master.csv`; "
              "every number below is computed, not written by hand.\n\n"
              f"Crops plotted: {', '.join(plotted)}"
              + (f" (not plotted - beyond the {MAX_CROPS} largest or < {MIN_ROWS_PLOT} valid district-years: "
                 f"{', '.join(skipped)})" if skipped else "") + ".\n\n"
              "> Caution: district-years are not independent (neighbouring districts share weather), so "
              "p-values overstate certainty. Correlation is not causation.\n\n")
    OUT_INSIGHTS.write_text(header + "\n".join(INSIGHTS), encoding="utf-8")
    log.info(f"  insights -> {rel(OUT_INSIGHTS)}")
    log.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
