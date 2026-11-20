"""Shared figure style for report PNGs: palette, rcParams, title block, layout helpers."""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

# ---- Palette (validated: CVD dE >= 8.7, normal-vision dE >= 17.8 on white, all pairs) -------
INK, INK2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, AXIS = "#e1e0d9", "#c3c2b7"
BLUE, BLUE_LIGHT, RED = "#2a78d6", "#86b6ef", "#e34948"
# Rainfall classes are polar (dry <-> wet): diverging poles + neutral gray midpoint,
# with marker shape as the secondary (non-colour) encoding.
RAIN_CLASS = {
    "Drought": dict(color=RED, marker="v"),
    "Normal": dict(color=MUTED, marker="o"),
    "Excess": dict(color=BLUE, marker="^"),
}
SEQ_BLUE = LinearSegmentedColormap.from_list(
    "seq_blue", ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"])
# Sequential ramp whose lightest step still shows on white (for point colours).
SEQ_BLUE_MARKS = LinearSegmentedColormap.from_list("seq_blue_marks", ["#86b6ef", "#3987e5", "#184f95", "#0d366b"])
DIVERGING = LinearSegmentedColormap.from_list(  # red (negative) - gray - blue (positive)
    "div_rb", ["#a32f2f", "#e34948", "#f4a9a8", "#f0efec", "#9ec5f4", "#3987e5", "#184f95"])

CLIMATE_FEATURES = {
    "rain_mm": "Seasonal rainfall", "rain_anomaly_z": "Rainfall anomaly (z)",
    "spi3_mean": "SPI-3 (mean)", "spi3_min": "SPI-3 (driest)", "dry_spell_count": "Dry spells (>=7 d)",
    "onset_delay_days": "Monsoon onset delay", "rain_cv_weekly": "Rainfall CV (weekly)",
    "heat_stress_days": "Heat-stress days (>35 degC)", "gdd_base10": "Growing degree days",
    "tmax_mean_c": "Mean Tmax", "tmin_mean_c": "Mean Tmin", "rh_mean_pct": "Mean rel. humidity",
}
SOIL_FEATURES = {"soil_degradation_score": "Soil degradation score", "soil_oc": "Organic carbon",
                 "soil_ph": "pH", "soil_n": "Nitrogen", "soil_p": "Phosphorus", "soil_k": "Potassium"}


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


def save_fig(fig, path, tight: bool = True) -> None:
    if tight:
        fig.tight_layout(rect=(0, 0, 1, 1 - 0.6 / fig.get_figheight()))
    fig.savefig(path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
