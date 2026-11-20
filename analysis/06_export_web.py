"""06 - Export compact JSON for the static website (web/public/data/).

Writes  districts.geojson   simplified boundaries of the study state + risk attributes
        timeseries.json     yield / anomaly / rainfall per district x crop, state yield per crop
        scenarios.json      rainfall x temperature grid of predicted % yield change
        metrics.json        model evaluation table + chosen model
        shap_importance.json
        correlations.json   climate features vs detrended yield anomaly, per crop
        recommendations.json
        summary.json        headline numbers for the landing page
Total size is checked against a 5 MB budget.

Usage:  python analysis/06_export_web.py
"""
from __future__ import annotations

import json
import math
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy import stats

import config
from common import ANALYSIS, PROCESSED, WEB_DATA, get_logger, rel
from plotstyle import CLIMATE_FEATURES

log = get_logger("06_export_web")

MODEL_DIR = ANALYSIS / "models"
BUDGET_BYTES = 5 * 1024 * 1024
SIMPLIFY_DEG = 0.005   # ~500 m; enough for a district map at web zoom levels
COORD_DECIMALS = 4     # ~10 m
DRIVER_LABELS = {"rain_variability": "Erratic rainfall", "drought_frequency": "Frequent drought",
                 "heat_stress": "Heat stress", "soil_degradation": "Soil degradation",
                 "yield_volatility": "Volatile yields"}


def clean(o, nd: int = 3):
    """Round floats, turn NaN/inf into null, numpy types into Python types - recursively."""
    if isinstance(o, dict):
        return {str(k): clean(v, nd) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v, nd) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        f = float(o)
        return None if not math.isfinite(f) else round(f, nd)
    if isinstance(o, np.bool_):
        return bool(o)
    if o is pd.NA or o is pd.NaT:
        return None
    return o


def write(name: str, obj, nd: int = 3) -> int:
    path = WEB_DATA / name
    text = json.dumps(clean(obj, nd), separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    path.write_text(text, encoding="utf-8")
    log.info(f"  {name:<22} {len(text.encode('utf-8')) / 1024:8.1f} KB")
    return len(text.encode("utf-8"))


def need(*names) -> bool:
    missing = [n for n in names if not (PROCESSED / n).exists()]
    if missing:
        log.error(f"Missing {missing} in {rel(PROCESSED)} - run 01-05 first.")
    return not missing


def main() -> int:
    if not need("districts.geojson", "master.csv", "risk_index.csv", "risk_district.csv", "scenarios.csv",
                "model_metrics.csv", "risk_weights.json", "recommendations.json"):
        return 1
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    master = pd.read_csv(PROCESSED / "master.csv")
    valid = master[(master["yield_flag"] == "ok") & master["yield_t_ha"].notna()]
    risk = pd.read_csv(PROCESSED / "risk_index.csv")
    dist = pd.read_csv(PROCESSED / "risk_district.csv")
    sc = pd.read_csv(PROCESSED / "scenarios.csv")
    meta = json.loads((MODEL_DIR / "best_model.json").read_text(encoding="utf-8"))
    weights = json.loads((PROCESSED / "risk_weights.json").read_text(encoding="utf-8"))
    state = master.get("state", pd.Series([config.STATE])).dropna().iloc[0] if "state" in master else config.STATE
    crops = sorted(risk["crop"].unique())
    log.info(f"KrishiRisk 06_export_web -> {rel(WEB_DATA)}")
    total = 0

    # ---- districts.geojson
    geo = gpd.read_file(PROCESSED / "districts.geojson")
    state = state or (geo["state"].iloc[0] if "state" in geo else None)
    geo["geometry"] = geo.geometry.simplify(SIMPLIFY_DEG, preserve_topology=True)
    geo = geo.merge(dist[["district", "risk_index", "risk_category", "cluster_name"]], on="district", how="left")
    # Top risk driver = component with the largest weighted contribution to the index.
    w = weights["weights"]
    contrib = pd.DataFrame({k: w[k] * risk[f"{k}_norm"] for k in DRIVER_LABELS}, index=risk.index)
    risk["driver"] = contrib.idxmax(axis=1, skipna=True).map(DRIVER_LABELS)
    by_crop = {d: {r.crop: {"index": r.risk_index, "category": r.risk_category, "mean_yield": r.mean_yield_t_ha,
                            "driver": r.driver,
                            "components": {k: getattr(r, f"{k}_norm") for k in DRIVER_LABELS}}
                   for r in g.itertuples()} for d, g in risk.groupby("district")}
    dist_contrib = contrib.mul(risk["mean_area_ha"], axis=0).groupby(risk["district"]).sum(min_count=1)
    dist_driver = dist_contrib.idxmax(axis=1, skipna=True).map(DRIVER_LABELS).to_dict()
    feats = []
    for r in geo.itertuples():
        gj = json.loads(gpd.GeoSeries([r.geometry]).to_json())["features"][0]["geometry"]
        feats.append({"type": "Feature", "geometry": gj,
                      "properties": {"district": r.district, "risk_index": r.risk_index,
                                     "risk_category": r.risk_category, "cluster": r.cluster_name,
                                     "driver": dist_driver.get(r.district),
                                     "crops": by_crop.get(r.district, {})}})
    total += write("districts.geojson", {"type": "FeatureCollection", "features": feats}, COORD_DECIMALS)

    # ---- timeseries.json
    series = {}
    for (d, c), g in master.sort_values("year").groupby(["district", "crop"]):
        if c not in crops:
            continue
        series.setdefault(d, {})[c] = {
            "year": g["year"].tolist(), "yield": g["yield_t_ha"].tolist(),
            "trend": g["yield_trend_t_ha"].tolist(), "anomaly_pct": g["yield_anomaly_pct"].tolist(),
            "rain_mm": g["rain_mm"].tolist(), "spi3": g["spi3_mean"].tolist(),
            "heat_days": g["heat_stress_days"].tolist()}
    st = valid[valid["crop"].isin(crops)].groupby(["crop", "year"]).agg(p=("production_t", "sum"),
                                                                         a=("area_ha", "sum")).reset_index()
    st["y"] = st["p"] / st["a"]
    state_series = {c: {"year": g["year"].tolist(), "yield": g["y"].tolist()} for c, g in st.groupby("crop")}
    total += write("timeseries.json", {"crops": crops, "district": series, "state": state_series})

    # ---- scenarios.json (grid lookup: pct[rain_index][temp_index])
    rains = sorted(sc["rain_change_pct"].unique())
    temps = sorted(sc["temp_change_c"].unique())
    grid = {}
    for (d, c), g in sc.groupby(["district", "crop"]):
        p = g.pivot(index="rain_change_pct", columns="temp_change_c", values="pct_change_vs_baseline")
        y0 = g[(g["rain_change_pct"] == 0) & (g["temp_change_c"] == 0)]["pred_yield_t_ha"]
        grid[f"{d}|{c}"] = {"baseline_yield": y0.iloc[0] if len(y0) else None,
                            "pct": p.reindex(index=rains, columns=temps).values.tolist()}
    area = risk.set_index(["district", "crop"])["mean_area_ha"]
    sc_state = {}
    for c, g in sc.groupby("crop"):
        g = g.assign(w=g.set_index(["district", "crop"]).index.map(area).values)
        agg = g.groupby(["rain_change_pct", "temp_change_c"]).apply(
            lambda x: np.average(x["pct_change_vs_baseline"], weights=x["w"]), include_groups=False)
        sc_state[c] = {"pct": agg.unstack().reindex(index=rains, columns=temps).values.tolist()}
    total += write("scenarios.json", {"rain_change_pct": rains, "temp_change_c": temps,
                                      "model": meta.get("model"), "reliable": meta.get("beats_trend_only_cv", False),
                                      "pairs": grid, "state": sc_state}, 2)

    # ---- metrics.json
    met = pd.read_csv(PROCESSED / "model_metrics.csv")
    pred_path = PROCESSED / "test_predictions.csv"
    preds = pd.read_csv(pred_path).to_dict(orient="records") if pred_path.exists() else []
    total += write("metrics.json", {"best_model": meta.get("model"), "beats_trend_only_cv": meta.get("beats_trend_only_cv"),
                                    "train_years": meta.get("train_years"), "test_years": meta.get("test_years"),
                                    "rows": met.to_dict(orient="records"), "test_predictions": preds})

    # ---- shap_importance.json
    shap_path = PROCESSED / "shap_importance.csv"
    shap_rows = pd.read_csv(shap_path).to_dict(orient="records") if shap_path.exists() else []
    total += write("shap_importance.json", {"model": meta.get("model"), "unit": "% of trend yield",
                                            "features": shap_rows})

    # ---- correlations.json
    corr = []
    for c in crops + ["All crops"]:
        g = valid if c == "All crops" else valid[valid["crop"] == c]
        for f, label in CLIMATE_FEATURES.items():
            m = g[[f, "yield_anomaly_pct"]].dropna()
            if len(m) >= 10 and m[f].nunique() > 1:
                r, p = stats.pearsonr(m[f], m["yield_anomaly_pct"])
                corr.append({"crop": c, "feature": f, "label": label, "r": r, "p": p, "n": len(m)})
    total += write("correlations.json", {"target": "detrended yield anomaly (%)", "rows": corr}, 4)

    # ---- recommendations.json
    recs = json.loads((PROCESSED / "recommendations.json").read_text(encoding="utf-8"))
    total += write("recommendations.json", recs)

    # ---- summary.json
    sev = risk[risk["risk_category"] == "Severe"]
    top = dist.sort_values("risk_index", ascending=False).iloc[0]
    tm = met[(met["split"] == "test") & (met["crop"] == "All crops")].set_index("model")
    best = meta.get("model")

    def state_change(r, t):
        s = sc[(sc["rain_change_pct"] == r) & (sc["temp_change_c"] == t)]
        w = s.set_index(["district", "crop"]).index.map(area).values
        return float(np.average(s["pct_change_vs_baseline"], weights=w)) if len(s) else None

    summary = {
        "project": "KrishiRisk", "state": state, "crops": crops,
        "districts": int(master["district"].nunique()),
        "years": [int(master["year"].min()), int(master["year"].max())],
        "district_crop_pairs": len(risk),
        "severe_pairs": len(sev), "severe_share": len(sev) / len(risk) if len(risk) else None,
        "highest_risk_district": {"district": top["district"], "index": top["risk_index"],
                                  "category": top["risk_category"], "cluster": top["cluster_name"]},
        "model": {"name": best, "test_rmse_t_ha": tm.loc[best, "rmse_t_ha"] if best in tm.index else None,
                  "test_r2": tm.loc[best, "r2"] if best in tm.index else None,
                  "test_r2_deviation": tm.loc[best, "r2_anomaly"] if best in tm.index else None,
                  "beats_trend_only_cv": meta.get("beats_trend_only_cv")},
        "risk_weights": weights.get("weights"), "risk_weight_method": weights.get("method"),
        "pair_category_cutoffs": weights.get("category_cutoffs"),
        "district_category_cutoffs": weights.get("district_category_cutoffs"),
        "scenario_state_pct": {"rain_-20": state_change(-20, 0), "temp_+2": state_change(0, 2.0),
                               "rain_-40_temp_+3": state_change(-40, 3.0)},
    }
    total += write("summary.json", summary)

    log.info(f"  total {total / 1024 / 1024:.2f} MB (budget {BUDGET_BYTES / 1024 / 1024:.0f} MB)")
    if total > BUDGET_BYTES:
        log.error("Web data exceeds the 5 MB budget - increase SIMPLIFY_DEG or trim timeseries.json.")
        return 1
    log.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
