"""05 - Climate Stress Risk Index, risk clusters, climate scenarios and recommendations.

Inputs   data/processed/master.csv, data/processed/shap_importance.csv,
         analysis/models/best_model.joblib + best_model.json, data/raw/climate/climate_daily.csv
Outputs  data/processed/risk_index.csv        district x crop index, components, category, actions
         data/processed/risk_district.csv     district-level index + cluster
         data/processed/risk_weights.json     component weights and how they were derived
         data/processed/scenarios.csv         predicted yield change per district x crop x scenario
         data/processed/recommendations.json  structured actions per category and district x crop
         report/figures/insights.md           risk section (between markers, replaced on re-run)

Usage:  python analysis/05_risk.py
"""
from __future__ import annotations

import json
import sys
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

import climate
from common import ANALYSIS, FIGURES, PROCESSED, RAW_CLIMATE, get_logger, rel, upsert_section

log = get_logger("05_risk")
warnings.filterwarnings("ignore", category=UserWarning)

IN_MASTER = PROCESSED / "master.csv"
IN_SHAP = PROCESSED / "shap_importance.csv"
IN_CLIMATE = RAW_CLIMATE / "climate_daily.csv"
MODEL_DIR = ANALYSIS / "models"
OUT_RISK = PROCESSED / "risk_index.csv"
OUT_DISTRICT = PROCESSED / "risk_district.csv"
OUT_WEIGHTS = PROCESSED / "risk_weights.json"
OUT_SCEN = PROCESSED / "scenarios.csv"
OUT_RECS = PROCESSED / "recommendations.json"
OUT_INSIGHTS = FIGURES / "insights.md"

SEED = 42
MIN_YEARS = 8           # district-crop needs this many valid years for the index
SPI_DROUGHT = -1.0      # drought year: season SPI-3 (mean) < -1 (McKee et al. "moderately dry")
REF_YEARS = 10          # scenarios perturb the climate of the last 10 years
RAIN_STEPS = [round(x, 2) for x in np.arange(-40, 20.1, 5)]   # % change in daily rainfall
TEMP_STEPS = [round(x, 2) for x in np.arange(0, 3.01, 0.5)]   # degC added to daily Tmax and Tmin
CATEGORIES = ["Low", "Moderate", "High", "Severe"]
WATER_INTENSIVE = {"rice", "paddy", "sugarcane"}

# ---- Index components -----------------------------------------------------------------------
# Each component is min-max normalised over all district x crop pairs (0 = least, 1 = most stress).
COMPONENTS = {
    "rain_variability": "Rainfall variability (inter-annual CV of seasonal rain)",
    "drought_frequency": f"Drought frequency (share of seasons with SPI-3 < {SPI_DROUGHT:g})",
    "heat_stress": "Heat stress (mean days with Tmax > 35 degC per season)",
    "soil_degradation": "Soil degradation score (0-1, from 02)",
    "yield_volatility": "Yield volatility (std. dev. of detrended yield anomaly, % = CV around trend)",
}
# Model features that stand for each climate/soil component. Their mean |SHAP| (from 04) sets the
# weights: a component gets weight in proportion to how strongly the yield model reacts to it.
COMPONENT_FEATURES = {
    "rain_variability": ["rain_cv_weekly", "rain_anomaly_z", "rain_mm"],
    "drought_frequency": ["spi3_mean", "spi3_min", "dry_spell_count", "onset_delay_days"],
    "heat_stress": ["heat_stress_days", "tmax_mean_c", "gdd_base10"],
    "soil_degradation": ["soil_degradation_score"],
}
# Yield volatility is the outcome itself (no model feature), so it gets a fixed share and the
# other four split the remainder by SHAP. Equal weights (0.2 each) are the fallback.
YIELD_VOL_WEIGHT = 0.20

SHORT = {"rain_variability": "erratic rainfall", "drought_frequency": "drought-prone",
         "heat_stress": "heat-exposed", "soil_degradation": "degraded soils",
         "yield_volatility": "volatile yields"}

# ---- Recommendations --------------------------------------------------------------------------
ACTIONS = {
    "monitoring": ("Keep agro-advisory monitoring",
                   "Continue weather-based agro-advisories and seasonal monitoring; risk is currently low."),
    "drought_tolerant_varieties": ("Drought- and heat-tolerant varieties",
                                   "Promote short-duration, stress-tolerant seed (e.g. Sahbhagi Dhan for "
                                   "upland rice) through seed-replacement programmes."),
    "millet_diversification": ("Diversify towards millets and pulses",
                               "Shift part of the area under water-intensive crops to millets (finger, "
                               "barnyard, pearl) and pulses that tolerate dry spells."),
    "soil_organic_matter": ("Build soil organic matter",
                            "Soil Health Card based fertiliser use, compost/farmyard manure, green manuring "
                            "and crop-residue retention to restore organic carbon."),
    "micro_irrigation": ("Micro-irrigation and water harvesting",
                         "Drip/sprinkler under PMKSY 'Per Drop More Crop' and farm ponds for protective "
                         "irrigation during dry spells."),
    "pmfby_targeting": ("Target PMFBY crop insurance",
                        "Prioritise Pradhan Mantri Fasal Bima Yojana enrolment and claim awareness where "
                        "yields swing most."),
    "heat_management": ("Shift sowing windows away from heat",
                        "Adjust sowing dates and use heat-tolerant varieties so flowering and grain filling "
                        "avoid days above 35 degC."),
}
CATEGORY_ACTIONS = {
    "Low": ["monitoring", "soil_organic_matter"],
    "Moderate": ["drought_tolerant_varieties", "soil_organic_matter", "pmfby_targeting"],
    "High": ["drought_tolerant_varieties", "micro_irrigation", "soil_organic_matter", "pmfby_targeting"],
    "Severe": ["pmfby_targeting", "micro_irrigation", "drought_tolerant_varieties", "millet_diversification",
               "soil_organic_matter"],
}
TRIGGER_LEVEL = 0.66  # a normalised component this high adds its specific actions
COMPONENT_ACTIONS = {
    "drought_frequency": ["drought_tolerant_varieties", "micro_irrigation"],
    "rain_variability": ["micro_irrigation"],
    "heat_stress": ["heat_management"],
    "soil_degradation": ["soil_organic_matter"],
    "yield_volatility": ["pmfby_targeting"],
}


# =====================================================================================
# 1. Index
# =====================================================================================
def components(valid: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (d, c), g in valid.groupby(["district", "crop"]):
        if g["year"].nunique() < MIN_YEARS:
            continue
        spi = g["spi3_mean"].dropna()
        rows.append(dict(
            district=d, crop=c, season=g["season"].iloc[0], n_years=g["year"].nunique(),
            mean_area_ha=g["area_ha"].mean(), mean_yield_t_ha=g["yield_t_ha"].mean(),
            rain_variability=g["rain_cv_interannual"].dropna().iloc[0] if g["rain_cv_interannual"].notna().any() else np.nan,
            drought_frequency=(spi < SPI_DROUGHT).mean() if len(spi) else np.nan,
            heat_stress=g["heat_stress_days"].mean(),
            soil_degradation=g["soil_degradation_score"].iloc[0],
            yield_volatility=g["yield_anomaly_pct"].std(),
        ))
    return pd.DataFrame(rows)


def derive_weights(meta: dict) -> dict:
    equal = {k: 1 / len(COMPONENTS) for k in COMPONENTS}
    if not IN_SHAP.exists():
        return {"method": "equal", "reason": "no SHAP importances found (run 04_model.py)", "weights": equal}
    if not meta.get("beats_trend_only_cv", False):
        return {"method": "equal", "weights": equal,
                "reason": "the yield model did not beat the trend-only reference in cross-validation, so its "
                          "SHAP importances are not a reliable basis for weights"}
    shap_imp = pd.read_csv(IN_SHAP).set_index("feature")["mean_abs_shap_pct"]
    raw = {k: float(shap_imp.reindex(f).fillna(0).sum()) for k, f in COMPONENT_FEATURES.items()}
    total = sum(raw.values())
    if total <= 0:
        return {"method": "equal", "reason": "SHAP importances are all zero", "weights": equal}
    w = {k: (1 - YIELD_VOL_WEIGHT) * v / total for k, v in raw.items()}
    w["yield_volatility"] = YIELD_VOL_WEIGHT
    return {"method": "shap", "weights": w, "shap_sum_by_component_pct": raw,
            "reason": f"mean |SHAP| of each component's model features ({meta.get('model')}), scaled to "
                      f"{1 - YIELD_VOL_WEIGHT:.0%}; yield volatility fixed at {YIELD_VOL_WEIGHT:.0%}"}


def build_index(comp: pd.DataFrame, weights: dict[str, float]) -> tuple[pd.DataFrame, dict]:
    for k in COMPONENTS:
        x = comp[k]
        rng = x.max() - x.min()
        comp[f"{k}_norm"] = (x - x.min()) / rng if rng > 0 else x * 0
    norm = comp[[f"{k}_norm" for k in COMPONENTS]]
    w = np.array([weights[k] for k in COMPONENTS])
    avail = norm.notna().to_numpy()
    comp["risk_index"] = 100 * (norm.fillna(0).to_numpy() * w).sum(axis=1) / (avail * w).sum(axis=1)
    comp["components_used"] = ["+".join(k for k, a in zip(COMPONENTS, row) if a) for row in avail]
    q = comp["risk_index"].quantile([0.25, 0.5, 0.75]).to_dict()
    cut = {"Low": [0, q[0.25]], "Moderate": [q[0.25], q[0.5]], "High": [q[0.5], q[0.75]], "Severe": [q[0.75], 100]}
    comp["risk_category"] = pd.cut(comp["risk_index"], [-0.01, q[0.25], q[0.5], q[0.75], 100.01],
                                   labels=CATEGORIES).astype(str)
    return comp, cut


# =====================================================================================
# 2. Clusters
# =====================================================================================
def cluster_districts(comp: pd.DataFrame, cut: dict) -> pd.DataFrame:
    def wavg(g, col):
        m = g[col].notna()
        return np.average(g.loc[m, col], weights=g.loc[m, "mean_area_ha"]) if m.any() else np.nan

    dist = pd.DataFrame([{"district": d, "risk_index": wavg(g, "risk_index"),
                          **{k: wavg(g, k) for k in COMPONENTS}, "n_crops": len(g)}
                         for d, g in comp.groupby("district")])
    # District (all-crop) scores are area-weighted averages, which pull toward the middle; classify them by
    # quartiles of the district scores themselves so the "all crops" map still separates districts.
    q = dist["risk_index"].quantile([0.25, 0.5, 0.75]).tolist()
    dist["risk_category"] = pd.cut(dist["risk_index"], [-0.01, *q, 100.01], labels=CATEGORIES).astype(str)
    dist.attrs["cutoffs"] = {"Low": [0, q[0]], "Moderate": [q[0], q[1]], "High": [q[1], q[2]], "Severe": [q[2], 100]}
    feats = list(COMPONENTS)
    ok = dist[feats].notna().all(axis=1)
    dist["cluster"] = -1
    dist["cluster_name"] = np.where(ok, "Not clustered", "Not clustered (missing data)")
    n = int(ok.sum())
    if n < 4:
        log.warning(f"  only {n} districts with complete data - clustering skipped")
        return dist
    Z = StandardScaler().fit_transform(dist.loc[ok, feats])
    scores = {}
    for k in range(2, min(6, n - 1) + 1):
        lab = KMeans(n_clusters=k, n_init=20, random_state=SEED).fit_predict(Z)
        scores[k] = silhouette_score(Z, lab)
    best_k = max(scores, key=scores.get)
    km = KMeans(n_clusters=best_k, n_init=20, random_state=SEED).fit(Z)
    log.info(f"  silhouette by k: { {k: round(v, 3) for k, v in scores.items()} } -> k = {best_k}")
    dist.loc[ok, "cluster"] = km.labels_
    def base_name(centre):  # components clearly above the district average (z >= 0.5), max two
        hi = [f for z, f in sorted(zip(centre, feats), reverse=True) if z >= 0.5][:2]
        if hi:
            return " & ".join(SHORT[f] for f in hi).capitalize()
        return "Low stress" if (centre <= 0).all() else "Moderate, mixed stress"

    names = {c: base_name(ctr) for c, ctr in enumerate(km.cluster_centers_)}
    for name in {n for n in names.values() if list(names.values()).count(n) > 1}:
        # Same profile name: tell the clusters apart by overall stress level (mean centroid z).
        same = sorted((c for c, n in names.items() if n == name), key=lambda c: km.cluster_centers_[c].mean())
        tags = ["milder", "stronger"] if len(same) == 2 else [f"level {i + 1}" for i in range(len(same))]
        for c, tag in zip(same, tags):
            names[c] = f"{name} ({tag})"
    dist.loc[ok, "cluster_name"] = dist.loc[ok, "cluster"].map(names)
    dist.attrs["silhouette"], dist.attrs["k"] = scores, best_k
    dist.attrs["centroids"] = {names[c]: dict(zip(feats, np.round(km.cluster_centers_[c], 2)))
                               for c in range(best_k)}
    return dist


# =====================================================================================
# 3. Scenarios
# =====================================================================================
RAIN_COLS = ["rain_mm", "spi3_mean", "spi3_min", "dry_spell_count", "rain_cv_weekly", "onset_doy",
             "rh_mean_pct", "climate_coverage"]
TEMP_COLS = ["heat_stress_days", "gdd_base10", "tmax_mean_c", "tmin_mean_c"]


def predict_rel(bundle: dict, rows: pd.DataFrame) -> np.ndarray:
    X = pd.DataFrame({c: (rows["crop"] == c[5:]).astype(float) if c.startswith("crop_") else rows[c].astype(float)
                      for c in bundle["features"]}, index=rows.index)
    return bundle["model"].predict(X[bundle["features"]])


def scenarios(master: pd.DataFrame, comp: pd.DataFrame, bundle: dict) -> tuple[pd.DataFrame, list[int]]:
    clim = pd.read_csv(IN_CLIMATE, parse_dates=["date"])
    all_years = sorted(int(y) for y in master["year"].unique())
    spi_par = climate.fit_spi(clim)
    hist = climate.season_features(clim, all_years, spi_par)
    base = climate.baselines(hist)

    # Guard: the shared code must reproduce 02's features for the observed climate
    chk = climate.add_baseline_features(hist, base).merge(
        master[["district", "year", "season", "rain_anomaly_z", "dry_spell_count", "gdd_base10"]]
        .drop_duplicates(["district", "year", "season"]), on=["district", "year", "season"], suffixes=("", "_m"))
    dev = max(float((chk[c] - chk[f"{c}_m"]).abs().max()) for c in ("rain_anomaly_z", "dry_spell_count", "gdd_base10"))
    if not dev < 1e-3:
        raise SystemExit(f"Scenario baseline differs from master.csv features (max diff {dev}). Re-run 02_features.py.")

    ref = all_years[-REF_YEARS:]
    pairs = comp[["district", "crop", "season", "soil_degradation", "mean_area_ha"]].rename(
        columns={"soil_degradation": "soil_degradation_score"})
    tr = bundle["trend"]
    last = max(all_years)
    pairs = pairs.merge(tr, on=["district", "crop"], how="inner")
    pairs["trend_ref_t_ha"] = pairs["a"] + pairs["b"] * last
    pairs = pairs[pairs["trend_ref_t_ha"] > 0]
    log.info(f"  {len(pairs)} district-crop pairs x {len(RAIN_STEPS)} rain x {len(TEMP_STEPS)} temperature "
             f"steps; reference climate {ref[0]}-{ref[-1]}; yield level = trend at {last}")

    rain_runs = {r: climate.season_features(clim, ref, spi_par, rain_factor=1 + r / 100)[["district", "year", "season", *RAIN_COLS]]
                 for r in RAIN_STEPS}
    temp_runs = {t: climate.season_features(clim, ref, spi_par, temp_delta=t)[["district", "year", "season", *TEMP_COLS]]
                 for t in TEMP_STEPS}
    out = []
    for r in RAIN_STEPS:
        for t in TEMP_STEPS:
            f = rain_runs[r].merge(temp_runs[t], on=["district", "year", "season"])
            f = climate.add_baseline_features(f, base)
            f = f[f["climate_coverage"] >= climate.MIN_COVERAGE]
            rows = pairs.merge(f, on=["district", "season"], how="inner")
            rows["rel"] = 1 + predict_rel(bundle, rows)
            g = rows.groupby(["district", "crop"]).agg(rel=("rel", "mean"), trend=("trend_ref_t_ha", "first"))
            g["rain_change_pct"], g["temp_change_c"] = r, t
            out.append(g.reset_index())
    sc = pd.concat(out, ignore_index=True)
    b = sc[(sc["rain_change_pct"] == 0) & (sc["temp_change_c"] == 0)].set_index(["district", "crop"])["rel"]
    sc["baseline_rel"] = sc.set_index(["district", "crop"]).index.map(b)
    sc["pred_yield_t_ha"] = sc["trend"] * sc["rel"]
    sc["pct_change_vs_baseline"] = 100 * (sc["rel"] / sc["baseline_rel"] - 1)
    sc = sc[["district", "crop", "rain_change_pct", "temp_change_c", "pred_yield_t_ha", "pct_change_vs_baseline"]]
    return sc, ref


# =====================================================================================
# 4. Recommendations
# =====================================================================================
def recommendations(comp: pd.DataFrame, cut: dict) -> dict:
    items = []
    for r in comp.itertuples():
        acts = [(a, f"{r.risk_category} risk category") for a in CATEGORY_ACTIONS[r.risk_category]]
        for k, extra in COMPONENT_ACTIONS.items():
            v = getattr(r, f"{k}_norm")
            if pd.notna(v) and v >= TRIGGER_LEVEL:
                acts += [(a, f"high {COMPONENTS[k].split(' (')[0].lower()} ({v:.2f} of max)") for a in extra]
        if (pd.notna(r.drought_frequency_norm) and r.drought_frequency_norm >= TRIGGER_LEVEL
                and r.crop.lower().strip() in WATER_INTENSIVE):
            acts.append(("millet_diversification", "water-intensive crop in a drought-prone district"))
        seen, uniq = set(), []
        for a, why in acts:
            if a not in seen:
                seen.add(a)
                uniq.append({"id": a, "why": why})
        items.append({"district": r.district, "crop": r.crop, "risk_index": round(r.risk_index, 1),
                      "risk_category": r.risk_category, "actions": uniq})
    return {
        "actions": {k: {"title": t, "detail": d} for k, (t, d) in ACTIONS.items()},
        "categories": {c: {"index_range": [round(cut[c][0], 1), round(cut[c][1], 1)], "actions": CATEGORY_ACTIONS[c]}
                       for c in CATEGORIES},
        "trigger_level": TRIGGER_LEVEL,
        "district_crop": items,
    }


# =====================================================================================
def main() -> int:
    for p in (IN_MASTER, IN_CLIMATE, MODEL_DIR / "best_model.joblib"):
        if not p.exists():
            log.error(f"Missing {rel(p)} - run 02_features.py and 04_model.py first.")
            return 1
    master = pd.read_csv(IN_MASTER)
    valid = master[(master["yield_flag"] == "ok") & master["yield_t_ha"].notna()]
    bundle = joblib.load(MODEL_DIR / "best_model.joblib")
    meta = json.loads((MODEL_DIR / "best_model.json").read_text(encoding="utf-8"))
    log.info(f"KrishiRisk 05_risk | {len(valid):,} valid rows | model {meta.get('model')}")

    log.info("== 1. Climate Stress Risk Index")
    comp = components(valid)
    wt = derive_weights(meta)
    log.info(f"  weights ({wt['method']}): { {k: round(v, 3) for k, v in wt['weights'].items()} } - {wt['reason']}")
    comp, cut = build_index(comp, wt["weights"])
    OUT_WEIGHTS.write_text(json.dumps({**wt, "components": COMPONENTS, "component_features": COMPONENT_FEATURES,
                                       "category_cutoffs": {k: [round(a, 2), round(b, 2)] for k, (a, b) in cut.items()},
                                       "category_rule": "quartiles of the district x crop index"}, indent=2),
                           encoding="utf-8")
    log.info(f"  {len(comp)} district-crop pairs; cut-offs (quartiles): "
             + ", ".join(f"{k} {a:.1f}-{b:.1f}" for k, (a, b) in cut.items()))

    log.info("== 2. Clustering districts")
    dist = cluster_districts(comp, cut)
    wj = json.loads(OUT_WEIGHTS.read_text(encoding="utf-8"))
    wj["district_category_cutoffs"] = {k: [round(x, 2), round(y, 2)] for k, (x, y) in dist.attrs["cutoffs"].items()}
    wj["district_category_rule"] = "quartiles of the district (area-weighted all-crop) index"
    OUT_WEIGHTS.write_text(json.dumps(wj, indent=2), encoding="utf-8")
    comp = comp.merge(dist[["district", "cluster", "cluster_name"]], on="district", how="left")
    dist.to_csv(OUT_DISTRICT, index=False, float_format="%.4f")
    for name, g in dist[dist["cluster"] >= 0].groupby("cluster_name"):
        log.info(f"  {name}: {sorted(g['district'])}")

    log.info("== 3. Recommendations")
    recs = recommendations(comp, cut)
    OUT_RECS.write_text(json.dumps(recs, indent=1), encoding="utf-8")
    comp["actions"] = ["|".join(a["id"] for a in it["actions"]) for it in recs["district_crop"]]
    comp.to_csv(OUT_RISK, index=False, float_format="%.4f")
    log.info(f"  -> {rel(OUT_RISK)}, {rel(OUT_DISTRICT)}, {rel(OUT_RECS)}")

    log.info("== 4. Scenarios")
    sc, ref = scenarios(master, comp, bundle)
    sc.to_csv(OUT_SCEN, index=False, float_format="%.4f")
    log.info(f"  {len(sc):,} rows -> {rel(OUT_SCEN)}")

    # ---- insights
    w = wt["weights"]
    top = comp.sort_values("risk_index", ascending=False).head(5)
    area = comp.set_index(["district", "crop"])["mean_area_ha"]

    def state_pct(r, t):
        s = sc[(sc["rain_change_pct"] == r) & (sc["temp_change_c"] == t)].set_index(["district", "crop"])
        a = area.reindex(s.index)
        return float(np.average(s["pct_change_vs_baseline"], weights=a)) if len(s) else np.nan

    lines_w = [f"Weights ({wt['method']}): " + ", ".join(f"{COMPONENTS[k].split(' (')[0]} {w[k]:.2f}" for k in COMPONENTS)
               + f". Basis: {wt['reason']}."]
    lines_c = [f"Categories are quartiles of the index across {len(comp)} district-crop pairs: "
               + ", ".join(f"{k} {a:.1f}-{b:.1f}" for k, (a, b) in cut.items())
               + ". The index is relative within the state: 'Severe' = the most stressed quarter."]
    def drivers(r):
        hi = [f"{SHORT[k]} {getattr(r, f'{k}_norm'):.2f}" for k in COMPONENTS
              if pd.notna(getattr(r, f"{k}_norm")) and getattr(r, f"{k}_norm") >= TRIGGER_LEVEL]
        return f"; main drivers (normalised): {', '.join(hi)}" if hi else "; no single dominant driver"

    lines_top = [f"{r.district} - {r.crop}: index {r.risk_index:.0f} ({r.risk_category}){drivers(r)}"
                 for r in top.itertuples()]
    lines_cl = []
    if "k" in dist.attrs:
        lines_cl.append(f"k = {dist.attrs['k']} chosen by silhouette "
                        f"({ {k: round(v, 2) for k, v in dist.attrs['silhouette'].items()} }).")
        for name, g in dist[dist["cluster"] >= 0].groupby("cluster_name"):
            lines_cl.append(f"{name} ({len(g)} districts: {', '.join(sorted(g['district']))}); centroid z-scores "
                            + ", ".join(f"{SHORT[k]} {v:+.1f}" for k, v in dist.attrs["centroids"][name].items()))
    lines_sc = [f"State average (area-weighted) predicted yield change: rainfall -20% -> {state_pct(-20, 0):+.1f}%; "
                f"+2 degC -> {state_pct(0, 2.0):+.1f}%; rainfall -40% with +3 degC -> {state_pct(-40, 3.0):+.1f}%.",
                f"Scenarios perturb the observed daily climate of {ref[0]}-{ref[-1]} and re-run the {meta.get('model')} "
                "model; yields are relative to the same climate unchanged."]
    if not meta.get("beats_trend_only_cv", False):
        lines_sc.append("Caution: the model did not beat the trend-only reference in CV, so scenario responses are weak "
                        "and should be read as indicative only.")
    if meta.get("model") in ("RandomForest", "XGBoost"):
        lines_sc.append("Tree-based models cannot extrapolate beyond the observed climate range, so extreme scenarios "
                        "are likely to understate impacts.")
    else:
        lines_sc.append("The linear model extrapolates straight-line effects beyond the observed climate range; with "
                        "correlated rainfall features, individual effects can have counter-intuitive signs, so read "
                        "extreme scenarios with caution.")
    section = ("## Climate Stress Risk Index\n\n"
               "Index (0-100) = weighted mean of five min-max normalised components: "
               + "; ".join(COMPONENTS.values()) + ".\n\n"
               + "\n".join(f"- {l}" for l in lines_w + lines_c) + "\n\n### Highest-risk district-crop pairs\n\n"
               + "\n".join(f"- {l}" for l in lines_top) + "\n\n### Risk profiles (K-means)\n\n"
               + "\n".join(f"- {l}" for l in lines_cl or ["Clustering skipped (too few districts)."])
               + "\n\n### Climate scenarios\n\n" + "\n".join(f"- {l}" for l in lines_sc) + "\n")
    upsert_section(OUT_INSIGHTS, "risk", section)
    log.info(f"  insights -> {rel(OUT_INSIGHTS)} (risk section)")
    log.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
