"""04 - Yield models: time-based evaluation, light tuning, SHAP interpretation.

Inputs   data/processed/master.csv
Outputs  data/processed/model_metrics.csv, data/processed/model_metrics.md
         analysis/models/best_model.joblib (+ best_model.json metadata)
         report/figures/fig09_actual_vs_predicted.png, fig10_residuals.png,
         fig11_shap_summary.png, fig12_shap_dependence.png
         report/figures/insights.md  (model section between markers, replaced on re-run)

Design
  * Target = relative deviation of yield from the district-crop trend:  y_rel = yield / trend - 1.
    The trend is fitted ONLY on the training years of each split/fold and projected forward, so no
    information from evaluation years leaks into the target. (02's yield_anomaly_pct uses all
    years, so it is deliberately not used here.)  Predicted yield = trend x (1 + predicted y_rel).
    This puts all crops on one scale, lets tree models handle the time trend, and makes SHAP values
    read directly as "% of expected (trend) yield".
  * Split: train = years <= last_year - 5, test = last 5 years. No random split anywhere.
  * Tuning: small grids, expanding-window time-series CV (validate on each of the last 4
    training years, fit on all earlier years).  Model choice: lowest grouped-CV RMSE (GroupKFold by
    year on the training set) - the test set is used only for the final report.
  * "TrendOnly" (y_rel = 0) is reported as a reference: a model is only useful if it beats it.
  * Known limitation: climate baselines inside the features (rain_anomaly_z, SPI gamma fit,
    median onset) were computed in 02 over the full record. They use rainfall only (no yield),
    so the effect on the evaluation is small, but it is not zero.

Usage:  python analysis/04_model.py
"""
from __future__ import annotations

import json
import sys
import warnings

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from common import ANALYSIS, FIGURES, PROCESSED, get_logger, rel, upsert_section
from plotstyle import (AXIS, BLUE, CLIMATE_FEATURES, INK, MUTED, SEQ_BLUE_MARKS, SOIL_FEATURES, grid_axes,
                       headline, save_fig, style)

log = get_logger("04_model")
warnings.filterwarnings("ignore", category=UserWarning)

IN_MASTER = PROCESSED / "master.csv"
OUT_METRICS = PROCESSED / "model_metrics.csv"
OUT_METRICS_MD = PROCESSED / "model_metrics.md"
OUT_SHAP = PROCESSED / "shap_importance.csv"
OUT_PRED = PROCESSED / "test_predictions.csv"  # best model, test years
MODELS_DIR = ANALYSIS / "models"
OUT_INSIGHTS = FIGURES / "insights.md"
MODEL_START, MODEL_END = "<!-- model-section:start -->", "<!-- model-section:end -->"

SEED = 42
TEST_YEARS = 5
TUNE_FOLDS = 4          # expanding-window folds for tuning
CV_FOLDS = 5            # GroupKFold by year for model comparison
MIN_TREND_YEARS = 8     # linear trend needs this many training years; 3-7 -> training mean; <3 -> row unused
MIN_ROWS_CROP = 20      # crops with fewer valid rows are left out of modelling

FEATURES = ["rain_mm", "rain_anomaly_z", "spi3_mean", "spi3_min", "dry_spell_count", "onset_delay_days",
            "rain_cv_weekly", "heat_stress_days", "gdd_base10", "tmax_mean_c", "tmin_mean_c", "rh_mean_pct",
            "soil_degradation_score"]
DEPENDENCE = ["rain_anomaly_z", "dry_spell_count", "heat_stress_days", "soil_degradation_score"]
LABELS = {**CLIMATE_FEATURES, **SOIL_FEATURES}

RF_GRID = [dict(max_depth=d, min_samples_leaf=l) for d in (None, 8, 4) for l in (1, 5, 10)]
XGB_GRID = [dict(max_depth=d, learning_rate=lr, min_child_weight=w)
            for d in (2, 3, 5) for lr in (0.03, 0.1) for w in (1, 5)]


def make_model(name: str, params: dict | None = None):
    params = params or {}
    if name == "LinearRegression":  # imputation is part of the model, fitted on training rows only
        return make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(),
                             LinearRegression())
    if name == "RandomForest":
        return make_pipeline(SimpleImputer(strategy="median"),
                             RandomForestRegressor(n_estimators=300, random_state=SEED, n_jobs=-1, **params))
    if name == "XGBoost":  # handles missing values natively
        return XGBRegressor(n_estimators=400, subsample=0.8, colsample_bytree=0.8, random_state=SEED,
                            n_jobs=-1, tree_method="hist", **params)
    raise ValueError(name)


# =====================================================================================
# Train-only trend and target
# =====================================================================================
def is_outlier(rows: pd.DataFrame) -> pd.Series:
    """yield_outlier_iqr is True/False/empty in the CSV; empty (not evaluated) counts as not an outlier."""
    return rows["yield_outlier_iqr"].astype(str).str.lower().eq("true")


def fit_trend(fit_rows: pd.DataFrame) -> pd.DataFrame:
    """Per district-crop trend from the given (training) rows: linear if >= MIN_TREND_YEARS years,
    otherwise the mean if >= 3 years. IQR outliers are excluded from the fit."""
    ok = fit_rows[~is_outlier(fit_rows)]
    out = []
    for (d, c), g in ok.groupby(["district", "crop"]):
        n = g["year"].nunique()
        if n >= MIN_TREND_YEARS:
            b, a = np.polyfit(g["year"].astype(float), g["yield_t_ha"], 1)
        elif n >= 3:
            b, a = 0.0, g["yield_t_ha"].mean()
        else:
            continue
        out.append((d, c, a, b))
    return pd.DataFrame(out, columns=["district", "crop", "a", "b"])


def apply_trend(rows: pd.DataFrame, trend: pd.DataFrame) -> pd.Series:
    m = rows[["district", "crop", "year"]].merge(trend, on=["district", "crop"], how="left")
    t = m["a"] + m["b"] * m["year"].astype(float)
    return pd.Series(t.where(t > 0).values, index=rows.index)


class Design:
    """Feature matrix with fixed columns (features + crop dummies)."""

    def __init__(self, features: list[str], crops: list[str]):
        self.features, self.crops = features, crops
        self.columns = features + [f"crop_{c}" for c in crops]

    def X(self, rows: pd.DataFrame) -> pd.DataFrame:
        X = rows[self.features].astype(float).copy()
        for c in self.crops:
            X[f"crop_{c}"] = (rows["crop"] == c).astype(float)
        return X[self.columns]


def split_xy(train: pd.DataFrame, evals: pd.DataFrame, design: Design):
    trend = fit_trend(train)
    tr = train.assign(trend=apply_trend(train, trend))
    ev = evals.assign(trend=apply_trend(evals, trend))
    tr = tr[tr["trend"].notna() & ~is_outlier(tr)]
    ev = ev[ev["trend"].notna()]
    tr = tr.assign(y_rel=tr["yield_t_ha"] / tr["trend"] - 1)
    ev = ev.assign(y_rel=ev["yield_t_ha"] / ev["trend"] - 1)
    return design.X(tr), tr["y_rel"], design.X(ev), ev


def fit_predict(name, params, train, evals, design):
    Xtr, ytr, Xev, ev = split_xy(train, evals, design)
    if name == "TrendOnly":
        return ev.assign(pred_rel=0.0), None
    model = make_model(name, params).fit(Xtr, ytr)
    return ev.assign(pred_rel=model.predict(Xev)), model


def rmse(a, b) -> float:
    return float(np.sqrt(mean_squared_error(a, b)))


# =====================================================================================
# Tuning and CV
# =====================================================================================
def ts_folds(train: pd.DataFrame):
    years = sorted(train["year"].unique())
    for k in range(TUNE_FOLDS, 0, -1):
        val = years[-k]
        yield train[train["year"] < val], train[train["year"] == val]


def tune(name, grid, train, design):
    best, best_score = None, np.inf
    for params in grid:
        preds = pd.concat([fit_predict(name, params, tr, va, design)[0] for tr, va in ts_folds(train)])
        score = rmse(preds["y_rel"], preds["pred_rel"])
        if score < best_score:
            best, best_score = params, score
    log.info(f"  {name}: best {best} (time-series CV RMSE {100 * best_score:.2f} pts of trend yield, "
             f"{len(grid)} settings tried)")
    return best


def grouped_cv(name, params, train, design) -> pd.DataFrame:
    gkf = GroupKFold(n_splits=min(CV_FOLDS, train["year"].nunique()))
    out = []
    for tr_idx, va_idx in gkf.split(train, groups=train["year"]):
        out.append(fit_predict(name, params, train.iloc[tr_idx], train.iloc[va_idx], design)[0])
    return pd.concat(out)


def metrics(pred: pd.DataFrame, model: str, split: str) -> list[dict]:
    pred = pred.assign(pred_yield=pred["trend"] * (1 + pred["pred_rel"]))
    rows = []
    for crop, g in [("All crops", pred)] + list(pred.groupby("crop")):
        if len(g) < 3:
            continue
        rows.append(dict(model=model, split=split, crop=crop, n=len(g),
                         rmse_t_ha=rmse(g["yield_t_ha"], g["pred_yield"]),
                         mae_t_ha=float(mean_absolute_error(g["yield_t_ha"], g["pred_yield"])),
                         r2=float(r2_score(g["yield_t_ha"], g["pred_yield"])),
                         rmse_pct=100 * rmse(g["y_rel"], g["pred_rel"]),
                         r2_anomaly=float(r2_score(g["y_rel"], g["pred_rel"]))))
    return rows


# =====================================================================================
# Figures
# =====================================================================================
def fig_actual_vs_pred(pred: pd.DataFrame, model: str, crops: list[str], ref: pd.DataFrame) -> None:
    pred = pred.assign(pred_yield=pred["trend"] * (1 + pred["pred_rel"]))
    fig, axes = grid_axes(len(crops), h=3.0)
    for ax, crop in zip(axes, crops):
        g = pred[pred["crop"] == crop]
        lo, hi = np.nanmin(g[["yield_t_ha", "pred_yield"]].values), np.nanmax(g[["yield_t_ha", "pred_yield"]].values)
        pad = 0.05 * (hi - lo)
        ax.plot([lo - pad, hi + pad], [lo - pad, hi + pad], color=AXIS, lw=1, label="1:1 line")
        ax.scatter(g["yield_t_ha"], g["pred_yield"], s=24, color=BLUE, alpha=0.7, edgecolor="white", lw=0.5)
        r2 = r2_score(g["yield_t_ha"], g["pred_yield"]) if len(g) > 2 else np.nan
        ax.set_title(f"{crop}: R² = {r2:.2f}, n = {len(g)}", loc="left")
        ax.set_xlabel("Actual yield (t/ha)")
        ax.set_ylabel("Predicted yield (t/ha)")
    axes[0].legend(loc="upper left")
    m, t = ref.loc[model], ref.loc["TrendOnly"]  # test metrics, all crops
    if m["rmse_t_ha"] < t["rmse_t_ha"]:
        title = (f"{model} beats the trend-only forecast on held-out years "
                 f"(RMSE {m['rmse_t_ha']:.3f} vs {t['rmse_t_ha']:.3f} t/ha)")
    else:
        title = (f"Weather and soil add no skill beyond the yield trend on held-out years "
                 f"(RMSE {m['rmse_t_ha']:.3f} vs {t['rmse_t_ha']:.3f} t/ha for trend alone)")
    headline(fig, title, f"{model}, test years {pred['year'].min()}-{pred['year'].max()} (never seen in "
                         "training). Grey line = perfect prediction; panel R² is within each crop")
    save_fig(fig, FIGURES / "fig09_actual_vs_predicted.png")


def fig_residuals(pred: pd.DataFrame, model: str, crops: list[str]) -> str:
    pred = pred.assign(pred_yield=pred["trend"] * (1 + pred["pred_rel"]))
    pred = pred.assign(resid_pct=100 * (pred["yield_t_ha"] - pred["pred_yield"]) / pred["pred_yield"])
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 3.8))
    a1.scatter(pred["pred_rel"] * 100, pred["resid_pct"], s=20, color=BLUE, alpha=0.6, edgecolor="white", lw=0.4)
    a1.axhline(0, color=INK, lw=1)
    a1.set_xlabel("Predicted deviation from trend (%)")
    a1.set_ylabel("Residual: actual vs predicted (%)")
    a1.set_title("Residuals vs prediction", loc="left")
    by_year = pred.groupby("year")["resid_pct"]
    yrs = sorted(pred["year"].unique())
    a2.boxplot([by_year.get_group(y).values for y in yrs], widths=0.5, patch_artist=True,
               boxprops=dict(facecolor="#cde2fb", edgecolor=BLUE), medianprops=dict(color=INK, lw=1.5),
               whiskerprops=dict(color=MUTED), capprops=dict(color=MUTED),
               flierprops=dict(marker="o", ms=3, mfc=MUTED, mec="none"))
    a2.set_xticks(range(1, len(yrs) + 1), yrs)
    a2.axhline(0, color=INK, lw=1)
    a2.set_xlabel("Test year")
    a2.set_ylabel("Residual (%)")
    a2.set_title("Residuals by test year", loc="left")
    med = by_year.median()
    worst = med.abs().idxmax()
    bias = pred["resid_pct"].median()
    centre = "centre near zero" if abs(bias) < 2 else ("are biased low" if bias < 0 else "are biased high")
    title = f"Residuals {centre} (median {bias:+.1f}%); largest year bias in {worst} ({med[worst]:+.1f}%)"
    headline(fig, title, f"{model}, test set. Residual = (actual - predicted) / predicted")
    save_fig(fig, FIGURES / "fig10_residuals.png")
    return (f"Median residual {bias:+.1f}%; the year with the largest median error is {worst} "
            f"({med[worst]:+.1f}%) - a year-wide error points to a state-wide shock the features miss.")


def shap_values(model_name, model, X_bg: pd.DataFrame, X: pd.DataFrame) -> np.ndarray:
    if model_name == "XGBoost":
        return shap.TreeExplainer(model).shap_values(X)
    if model_name == "RandomForest":
        imp, rf = model[0], model[-1]
        return shap.TreeExplainer(rf).shap_values(pd.DataFrame(imp.transform(X), columns=X.columns))
    bg = X_bg.sample(min(200, len(X_bg)), random_state=SEED)
    expl = shap.Explainer(model.predict, shap.maskers.Independent(bg, max_samples=len(bg)), seed=SEED)
    return expl(X).values


def fig_shap(model_name, sv: np.ndarray, X: pd.DataFrame) -> list[str]:
    sv = 100 * sv  # fraction of trend yield -> percentage points
    feat_idx = [i for i, c in enumerate(X.columns) if not c.startswith("crop_")]
    names = [LABELS.get(X.columns[i], X.columns[i]) for i in feat_idx]
    S, V = sv[:, feat_idx], X.iloc[:, feat_idx]
    imp = np.abs(S).mean(axis=0)
    order = np.argsort(imp)
    shap_table = pd.DataFrame({"feature": [X.columns[i] for i in feat_idx], "label": names,
                               "mean_abs_shap_pct": imp, "mean_shap_pct": S.mean(axis=0)})
    shap_table.sort_values("mean_abs_shap_pct", ascending=False).to_csv(OUT_SHAP, index=False, float_format="%.4f")

    # Beeswarm (drawn here so it follows the report style): one row per feature, x = SHAP,
    # colour = feature value rank within the feature (light = low, dark = high).
    fig, ax = plt.subplots(figsize=(8, 0.42 * len(order) + 1.4))
    rng = np.random.default_rng(SEED)
    for row, j in enumerate(order):
        x, v = S[:, j], V.iloc[:, j]
        ok = v.notna().values
        rank = v.rank(pct=True).values
        y = row + rng.uniform(-0.28, 0.28, len(x))
        ax.scatter(x[~ok], y[~ok], s=7, color="#d9d8d3", lw=0)
        ax.scatter(x[ok], y[ok], s=7, c=rank[ok], cmap=SEQ_BLUE_MARKS, vmin=0, vmax=1, lw=0)
    ax.axvline(0, color=AXIS, lw=0.8)
    ax.set_yticks(range(len(order)), [names[j] for j in order])
    ax.set_xlabel("SHAP value: effect on yield (% of trend yield)")
    ax.grid(axis="y", visible=False)
    sm = plt.cm.ScalarMappable(cmap=SEQ_BLUE_MARKS)
    cb = fig.colorbar(sm, ax=ax, pad=0.01, aspect=30)
    cb.set_ticks([0, 1], labels=["Low", "High"])
    cb.set_label("Feature value (grey = missing)")
    cb.outline.set_visible(False)
    top = int(order[-1])
    headline(fig, f"{names[top]} moves yield the most (mean |effect| {imp[top]:.1f}% of trend yield)",
             f"SHAP values of the {model_name} model, one dot per district-year-crop; sorted by mean |SHAP|")
    save_fig(fig, FIGURES / "fig11_shap_summary.png")

    # Dependence plots for the four features named in the brief
    dep = [f for f in DEPENDENCE if f in X.columns]
    fig, axes = grid_axes(len(dep), ncols=2, w=4.4, h=3.2)
    for ax, f in zip(axes, dep):
        j = list(X.columns).index(f)
        x, s = X[f], sv[:, j]
        ok = x.notna().values
        ax.scatter(x[ok], s[ok], s=12, color=BLUE, alpha=0.45, lw=0)
        if x[ok].nunique() > 4:  # binned mean line
            bins = pd.qcut(x[ok], q=min(8, x[ok].nunique()), duplicates="drop")
            mean = pd.Series(s[ok]).groupby(bins.values, observed=True).mean()
            ax.plot([b.mid for b in mean.index], mean.values, color=INK, lw=1.8, marker="o", ms=3)
        ax.axhline(0, color=AXIS, lw=0.8)
        ax.set_xlabel(LABELS.get(f, f) + {"rain_anomaly_z": " (z-score)", "dry_spell_count": " (count)",
                                           "heat_stress_days": " (days)", "soil_degradation_score": " (0-1)"}.get(f, ""))
        ax.set_ylabel("Effect on yield (% of trend)")
        ax.set_title(LABELS.get(f, f), loc="left")
    headline(fig, "How rainfall, dry spells, heat and soil shift predicted yield",
             f"SHAP dependence, {model_name}. Line = mean effect within value bins")
    save_fig(fig, FIGURES / "fig12_shap_dependence.png")

    # ---- Interpretation numbers
    lines = []
    rank_txt = ", ".join(f"{names[j]} ({imp[j]:.1f})" for j in order[::-1][:5])
    lines.append(f"Mean |SHAP| ranking (percentage points of trend yield): {rank_txt}.")
    harms = []
    for j in range(len(names)):
        v, s = V.iloc[:, j], S[:, j]
        ok = v.notna().values
        if ok.sum() < 20 or v[ok].nunique() < 3:
            continue
        lo_q, hi_q = v[ok].quantile([0.1, 0.9])
        lo_eff = s[ok][(v[ok] <= lo_q).values].mean()
        hi_eff = s[ok][(v[ok] >= hi_q).values].mean()
        side, eff, thr = ("high", hi_eff, hi_q) if hi_eff < lo_eff else ("low", lo_eff, lo_q)
        harms.append((names[j], side, eff, thr, hi_eff - lo_eff))
    harms.sort(key=lambda t: t[2])
    for name, side, eff, thr, spread in harms[:4]:
        if eff >= 0:
            break
        cmp_ = ">=" if side == "high" else "<="
        lines.append(f"{name}: in the {'top' if side == 'high' else 'bottom'} 10% of values ({cmp_} {thr:.2f}) "
                     f"the model lowers yield by {abs(eff):.1f}% of trend on average "
                     f"(high-vs-low difference {spread:+.1f} pts).")
    for f in dep:
        j = list(X.columns).index(f)
        v, s = X[f], sv[:, j]
        ok = v.notna().values
        if ok.sum() > 10 and v[ok].nunique() > 2:
            slope = np.polyfit(v[ok], s[ok], 1)[0]
            unit = {"rain_anomaly_z": "per +1 SD of rainfall", "dry_spell_count": "per extra dry spell",
                    "heat_stress_days": "per extra heat-stress day",
                    "soil_degradation_score": "per +0.1 of degradation score"}[f]
            k = 0.1 if f == "soil_degradation_score" else 1
            lines.append(f"{LABELS[f]}: average effect {slope * k:+.2f}% of trend yield {unit} (linear fit to SHAP).")
    return lines


# =====================================================================================
def main() -> int:
    if not IN_MASTER.exists():
        log.error(f"Missing {rel(IN_MASTER)} - run 02_features.py first.")
        return 1
    style()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    m = pd.read_csv(IN_MASTER)
    d = m[(m["yield_flag"] == "ok") & m["yield_t_ha"].notna()].copy()
    counts = d.groupby("crop").size()
    small = sorted(counts[counts < MIN_ROWS_CROP].index)
    if small:
        log.warning(f"  crops left out (< {MIN_ROWS_CROP} valid rows): {small}")
    d = d[~d["crop"].isin(small)].reset_index(drop=True)
    crops = sorted(d["crop"].unique())
    features = [f for f in FEATURES if f in d and d[f].notna().any()]
    design = Design(features, crops)

    last = int(d["year"].max())
    cutoff = last - TEST_YEARS
    train, test = d[d["year"] <= cutoff], d[d["year"] > cutoff]
    log.info(f"KrishiRisk 04_model | train {int(train['year'].min())}-{cutoff} ({len(train)} rows), "
             f"test {cutoff + 1}-{last} ({len(test)} rows) | crops {crops} | {len(features)} features")

    log.info("== Tuning (expanding-window time-series CV)")
    params = {"LinearRegression": {}, "TrendOnly": {},
              "RandomForest": tune("RandomForest", RF_GRID, train, design),
              "XGBoost": tune("XGBoost", XGB_GRID, train, design)}

    log.info("== Grouped CV by year (training years) and test evaluation")
    rows, test_preds, models = [], {}, {}
    for name in ("TrendOnly", "LinearRegression", "RandomForest", "XGBoost"):
        rows += metrics(grouped_cv(name, params[name], train, design), name, "cv_grouped_by_year")
        pred, model = fit_predict(name, params[name], train, test, design)
        rows += metrics(pred, name, "test")
        test_preds[name], models[name] = pred, model
    met = pd.DataFrame(rows)
    met.to_csv(OUT_METRICS, index=False, float_format="%.4f")

    cv_all = met[(met["split"] == "cv_grouped_by_year") & (met["crop"] == "All crops")].set_index("model")
    best = cv_all.drop(index="TrendOnly")["rmse_pct"].idxmin()
    beats = cv_all.loc[best, "rmse_pct"] < cv_all.loc["TrendOnly", "rmse_pct"]
    log.info("\n" + met[met["crop"] == "All crops"].to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    log.info(f"  best by grouped-CV RMSE: {best}" + ("" if beats else "  (does NOT beat TrendOnly)"))

    md = ["| Model | Split | Crop | n | RMSE (t/ha) | MAE (t/ha) | R² | RMSE (% of trend) | R² of deviation |",
          "|---|---|---|---|---|---|---|---|---|"]
    for r in met.itertuples():
        md.append(f"| {r.model}{' **(best)**' if r.model == best else ''} | {r.split} | {r.crop} | {r.n} | "
                  f"{r.rmse_t_ha:.3f} | {r.mae_t_ha:.3f} | {r.r2:.3f} | {r.rmse_pct:.1f} | {r.r2_anomaly:.3f} |")
    OUT_METRICS_MD.write_text("# Model metrics\n\nGenerated by `analysis/04_model.py`. Model chosen by grouped-CV "
                              "RMSE (training years only); test = last 5 years.\n\n" + "\n".join(md) + "\n",
                              encoding="utf-8")
    log.info(f"  metrics -> {rel(OUT_METRICS)}, {rel(OUT_METRICS_MD)}")

    # Final model on all training years (same train-only trend as the test evaluation)
    final = models[best]
    joblib.dump({"model": final, "model_name": best, "features": design.columns, "params": params[best],
                 "trend": fit_trend(train), "train_years": [int(train["year"].min()), cutoff]},
                MODELS_DIR / "best_model.joblib")
    (MODELS_DIR / "best_model.json").write_text(json.dumps({
        "model": best, "params": params[best], "features": design.columns, "crops": crops,
        "train_years": [int(train["year"].min()), cutoff], "test_years": [cutoff + 1, last],
        "target": "yield / train-only district-crop trend - 1", "beats_trend_only_cv": bool(beats),
        "cv_rmse_pct": {k: round(float(v), 3) for k, v in cv_all["rmse_pct"].items()}}, indent=2), encoding="utf-8")
    log.info(f"  model -> {rel(MODELS_DIR / 'best_model.joblib')}")

    log.info("== Figures")
    pred = test_preds[best]
    test_out = pred.assign(predicted_t_ha=pred["trend"] * (1 + pred["pred_rel"]))
    test_out = test_out[["district", "crop", "year", "yield_t_ha", "predicted_t_ha"]].rename(
        columns={"yield_t_ha": "actual_t_ha"})
    test_out.to_csv(OUT_PRED, index=False, float_format="%.4f")
    test_all = met[(met["split"] == "test") & (met["crop"] == "All crops")].set_index("model")
    fig_actual_vs_pred(pred, best, crops, test_all)
    resid_line = fig_residuals(pred, best, crops)
    Xtr, _, Xall, _ = split_xy(train, d, design)  # explain all rows with the final model
    sv = shap_values(best, final, Xtr, Xall)
    shap_lines = fig_shap(best, sv, Xall)
    log.info(f"  saved fig09-fig12 in {rel(FIGURES)}")

    # ---- insights.md model section
    t = met[(met["split"] == "test") & (met["crop"] == "All crops")].set_index("model")
    perf = [f"Test years {cutoff + 1}-{last}: " + "; ".join(
        f"{n} RMSE {t.loc[n, 'rmse_t_ha']:.3f} t/ha, R² {t.loc[n, 'r2']:.2f}" for n in t.index) + "."]
    perf.append(f"Best model by grouped CV: {best}. On the deviation from trend it reaches R² "
                f"{t.loc[best, 'r2_anomaly']:.2f} on test vs 0 for TrendOnly"
                + ("." if beats else " - it does not beat the trend-only reference in CV, so the weather/soil "
                   "features add little predictive skill; treat SHAP effects as descriptive."))
    perf.append("Most of the overall R² on yield comes from the district-crop trend (compare TrendOnly); the "
                "'R² of deviation' column is the honest measure of what weather and soil add.")
    section = (f"{MODEL_START}\n## Model - {best}\n\nFull table: `data/processed/model_metrics.md`.\n\n"
               + "\n".join(f"- {l}" for l in perf) + "\n\n"
               "![Actual vs predicted](fig09_actual_vs_predicted.png)\n\n"
               "![Residuals](fig10_residuals.png)\n\n- " + resid_line + "\n\n"
               "### What moves yield (SHAP)\n\n![SHAP summary](fig11_shap_summary.png)\n\n"
               "![SHAP dependence](fig12_shap_dependence.png)\n\n"
               + "\n".join(f"- {l}" for l in shap_lines) + "\n\n"
               "> SHAP shows how the model uses each feature, not proven causal effects; correlated "
               "features (e.g. rainfall, SPI, dry spells) share credit.\n" + MODEL_END + "\n")
    upsert_section(OUT_INSIGHTS, "model", section.replace(MODEL_START, "").replace(MODEL_END, ""))
    log.info(f"  insights -> {rel(OUT_INSIGHTS)} (model section)")
    log.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
