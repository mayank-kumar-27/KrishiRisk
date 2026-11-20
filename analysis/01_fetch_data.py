"""01 - Fetch and inventory all raw data for KrishiRisk.

Steps
  1. District boundaries  datameet/maps Census 2011 shapefile -> data/raw/geo/ (downloaded once)
                          state subset -> data/processed/districts.geojson
                          centroids    -> data/processed/district_centroids.csv
  2. Climate              NASA POWER daily point API at each district centroid
                          cache: data/raw/climate/<district>_<start>_<end>.json (one per district)
                          combined: data/raw/climate/climate_daily.csv (gitignored; large)
  3. Soil                 local Soil Health Card / district file in data/raw/soil/*.csv|xlsx if present,
                          otherwise SoilGrids v2.0 REST at each centroid
                          cache: data/raw/soil/soilgrids_cache/<district>.json
                          output: data/processed/soil_district.csv
  4. Crop yield           manual file(s) in data/raw/crop/ (data.gov.in / DES APY / ICRISAT DLD)
                          output: data/processed/crop_long.csv (state subset, long format)
  5. Name matching        data/processed/district_name_map.csv  (rows with status=manual survive re-runs)
  6. Inventory            data/processed/data_inventory.csv + printed table

Nothing is synthesised: missing values stay missing, and a missing manual file stops the
script with download instructions. Re-running is cheap: downloads are cached.

Usage:  python analysis/01_fetch_data.py [--state "Uttarakhand"] [--start 1997] [--end 2024]
"""
from __future__ import annotations

import argparse
import difflib
import re
import sys

import geopandas as gpd
import numpy as np
import pandas as pd

import config
from common import (
    PROCESSED, RAW_CLIMATE, RAW_CROP, RAW_GEO, RAW_SOIL,
    ManualDownloadRequired, PoliteClient, get_logger, norm_name, norm_state,
    read_json_or_none, rel, slug, write_json_atomic,
)

log = get_logger("01_fetch_data")

GEO_DIR = RAW_GEO / "datameet_census2011"
SOILGRIDS_CACHE = RAW_SOIL / "soilgrids_cache"
OUT_DISTRICTS = PROCESSED / "districts.geojson"
OUT_CENTROIDS = PROCESSED / "district_centroids.csv"
OUT_CLIMATE = RAW_CLIMATE / "climate_daily.csv"
OUT_SOIL = PROCESSED / "soil_district.csv"
OUT_CROP = PROCESSED / "crop_long.csv"
OUT_NAME_MAP = PROCESSED / "district_name_map.csv"
OUT_INVENTORY = PROCESSED / "data_inventory.csv"


# =====================================================================================
# 1. District boundaries
# =====================================================================================
def load_districts(state: str) -> gpd.GeoDataFrame:
    log.info("== 1. District boundaries (datameet/maps, Census 2011)")
    GEO_DIR.mkdir(parents=True, exist_ok=True)
    client = PoliteClient(min_interval_s=0.5, logger=log)
    for fname in config.GEO_FILES:
        dest = GEO_DIR / fname
        if dest.exists() and dest.stat().st_size > 0:
            continue
        log.info(f"  downloading {fname}")
        r = client.get(config.GEO_BASE_URL + fname)
        tmp = dest.with_suffix(dest.suffix + ".part")
        tmp.write_bytes(r.content)
        tmp.replace(dest)
    gdf = gpd.read_file(GEO_DIR / "2011_Dist.shp")
    log.info(f"  read {len(gdf)} districts (all India) from {rel(GEO_DIR)}")
    if gdf.crs is None:
        log.warning("  shapefile has no CRS; assuming EPSG:4326 (lon/lat)")
        gdf = gdf.set_crs(4326)
    gdf = gdf.to_crs(4326)

    target = norm_state(state)
    sub = gdf[gdf["ST_NM"].map(norm_state) == target].copy()
    if sub.empty:
        states = sorted(gdf["ST_NM"].unique())
        hint = ""
        if target in ("telangana", "ladakh"):
            hint = (f"\n'{state}' did not exist in Census 2011; its districts are inside "
                    "Andhra Pradesh / Jammu & Kashmir in this map. A newer boundary file is needed.")
        raise SystemExit(f"State '{state}' not found in the district map.{hint}\n"
                         f"States available: {states}")

    # One row per district (a few districts are stored as several polygons).
    sub = sub.dissolve(by="DISTRICT", as_index=False, aggfunc={"ST_NM": "first", "censuscode": "first"})
    sub = sub.rename(columns={"DISTRICT": "district", "ST_NM": "state"})

    # Centroids in a metric CRS; fall back to a guaranteed-interior point for odd shapes.
    metric = sub.to_crs(sub.estimate_utm_crs())
    cent = metric.geometry.centroid
    inside = cent.within(metric.geometry)
    pts = cent.where(inside, metric.geometry.representative_point())
    pts = gpd.GeoSeries(pts, crs=metric.crs).to_crs(4326)
    sub["lon"] = pts.x.round(4)
    sub["lat"] = pts.y.round(4)
    sub["point_method"] = np.where(inside, "centroid", "representative_point")
    if (~inside).any():
        log.info(f"  centroid outside polygon -> used interior point for: "
                 f"{sorted(sub.loc[~inside.values, 'district'])}")

    sub = sub.sort_values("district").reset_index(drop=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    sub[["district", "state", "censuscode", "geometry"]].to_file(OUT_DISTRICTS, driver="GeoJSON")
    sub[["district", "state", "censuscode", "lat", "lon", "point_method"]].to_csv(OUT_CENTROIDS, index=False)
    log.info(f"  {state}: {len(sub)} districts -> {rel(OUT_DISTRICTS)}, {rel(OUT_CENTROIDS)}")
    return sub


# =====================================================================================
# 2. Climate - NASA POWER
# =====================================================================================
def fetch_climate(districts: gpd.GeoDataFrame, start: int, end: int) -> tuple[pd.DataFrame, list[str]]:
    log.info(f"== 2. Climate (NASA POWER daily {start}-{end}: {', '.join(config.NASA_POWER_PARAMS)})")
    RAW_CLIMATE.mkdir(parents=True, exist_ok=True)
    client = PoliteClient(config.NASA_POWER_MIN_INTERVAL_S, timeout_s=300, logger=log)
    frames, failed = [], []
    for i, d in enumerate(districts.itertuples(), 1):
        request = {
            "parameters": ",".join(config.NASA_POWER_PARAMS), "community": "AG",
            "latitude": float(d.lat), "longitude": float(d.lon),
            "start": f"{start}0101", "end": f"{end}1231", "format": "JSON",
        }
        cache = RAW_CLIMATE / f"{slug(d.district)}_{start}_{end}.json"
        cached = read_json_or_none(cache)
        if cached and cached.get("request") == request:
            payload, how = cached["response"], "cache"
        else:
            try:
                payload = client.get(config.NASA_POWER_URL, params=request).json()
            except Exception as e:  # noqa: BLE001 - logged and reported in the inventory
                log.error(f"  [{i}/{len(districts)}] {d.district}: FAILED - {e}")
                failed.append(d.district)
                continue
            write_json_atomic(cache, {"request": request, "response": payload})
            how = "downloaded"
        params = payload.get("properties", {}).get("parameter", {})
        missing = [p for p in config.NASA_POWER_PARAMS if p not in params]
        if missing:
            log.error(f"  {d.district}: response lacks {missing}; messages={payload.get('messages')}")
            failed.append(d.district)
            continue
        fill = payload.get("header", {}).get("fill_value", -999.0)
        df = pd.DataFrame({p: pd.Series(params[p], dtype="float64") for p in config.NASA_POWER_PARAMS})
        df = df.replace(fill, np.nan)
        df.index = pd.to_datetime(df.index, format="%Y%m%d")
        df = df.rename_axis("date").reset_index()
        df.insert(1, "district", d.district)
        n_fill = int(df[config.NASA_POWER_PARAMS].isna().sum().sum())
        log.info(f"  [{i}/{len(districts)}] {d.district}: {len(df)} days ({how})"
                 + (f", {n_fill} fill values -> NaN" if n_fill else ""))
        frames.append(df)

    clim = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    if not clim.empty:
        clim.to_csv(OUT_CLIMATE, index=False)
        log.info(f"  {len(clim):,} rows -> {rel(OUT_CLIMATE)} "
                 "(units: PRECTOTCORR mm/day, T2M_MAX/T2M_MIN degC, RH2M %)")
    if failed:
        log.error(f"  climate download failed for {len(failed)} district(s): {failed} - re-run to retry")
    return clim, failed


# =====================================================================================
# 3. Soil - local file or SoilGrids
# =====================================================================================
SOIL_PATTERNS = {
    "district": r"^(district|district_?name|dist_?name|districtname)$",
    "state": r"^(state|state_?name)$",
    "n": r"^(available_?|avail_?)?(n|nitrogen)(_.*)?$",
    "p": r"^(available_?|avail_?)?(p|phosphorus|p2o5)(_.*)?$",
    "k": r"^(available_?|avail_?)?(k|potassium|k2o)(_.*)?$",
    "ph": r"^ph(_.*)?$",
    "oc": r"^(oc|organic_?carbon|soc)(_.*)?$",
}


def _norm_col(c) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(c).strip().lower()).strip("_")


def _read_table(path) -> pd.DataFrame:
    if path.suffix.lower() in (".xlsx", ".xls"):
        return pd.read_excel(path)
    for enc in ("utf-8", "utf-8-sig", "latin1"):
        try:
            return pd.read_csv(path, encoding=enc, low_memory=False)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"cannot decode {path}")


def _data_files(folder) -> list:
    if not folder.exists():
        return []
    return sorted(p for p in folder.iterdir()
                  if p.is_file() and p.suffix.lower() in (".csv", ".xlsx", ".xls"))


def load_soil_local(files, state: str) -> pd.DataFrame:
    frames = []
    for f in files:
        raw = _read_table(f)
        cols = {}
        for c in raw.columns:
            nc = _norm_col(c)
            for key, pat in SOIL_PATTERNS.items():
                if key not in cols and re.match(pat, nc):
                    cols[key] = c
                    break
        log.info(f"  {f.name}: {len(raw)} rows; detected columns {cols}")
        if "district" not in cols:
            raise SystemExit(f"Soil file {rel(f)} has no recognisable district column. "
                             f"Columns: {list(raw.columns)}")
        nutrients = [k for k in ("n", "p", "k", "ph", "oc") if k in cols]
        if not nutrients:
            raise SystemExit(f"Soil file {rel(f)}: none of N, P, K, pH, OC recognised. "
                             f"Columns: {list(raw.columns)}")
        df = raw[[cols[k] for k in cols]].rename(columns={v: k for k, v in cols.items()})
        if "state" in df:
            keep = df["state"].map(norm_state) == norm_state(state)
            log.info(f"    state filter '{state}': {keep.sum()} of {len(df)} rows")
            df = df[keep]
        for k in nutrients:
            df[k] = pd.to_numeric(df[k], errors="coerce")
        df["source_file"] = f.name
        frames.append(df.drop(columns=["state"], errors="ignore"))
    soil = pd.concat(frames, ignore_index=True)
    n_rows = len(soil)
    nutrients = [k for k in ("n", "p", "k", "ph", "oc") if k in soil]
    soil = (soil.groupby("district", as_index=False)
                .agg({**{k: "mean" for k in nutrients}, "source_file": "first"}))
    soil = soil.rename(columns={"district": "district_source"})
    soil["source"] = "local_file"
    log.info(f"  aggregated {n_rows} rows to {len(soil)} district means "
             f"(units as in source file - check them; nutrients present: {nutrients})")
    for k in ("n", "p", "k", "ph", "oc"):
        if k not in soil:
            log.warning(f"  '{k}' not present in local soil file(s) - left out, not filled")
    return soil


SOILGRIDS_COLS = {"nitrogen": "n_g_per_kg", "phh2o": "ph", "soc": "oc_g_per_kg",
                  "clay": "clay_pct", "sand": "sand_pct", "silt": "silt_pct"}
SOILGRIDS_WEIGHTS = {"0-5cm": 5, "5-15cm": 10, "15-30cm": 15}


def _parse_soilgrids(resp: dict) -> dict:
    out = {}
    for layer in resp.get("properties", {}).get("layers", []):
        name = layer["name"]
        d_factor = layer["unit_measure"]["d_factor"]
        vals = {dp["label"]: dp["values"].get("mean") for dp in layer["depths"]}
        if any(vals.get(lbl) is None for lbl in SOILGRIDS_WEIGHTS):
            out[SOILGRIDS_COLS[name]] = np.nan  # incomplete profile -> leave missing
            continue
        w = sum(SOILGRIDS_WEIGHTS.values())
        out[SOILGRIDS_COLS[name]] = sum(vals[l] * wt for l, wt in SOILGRIDS_WEIGHTS.items()) / w / d_factor
    return out


def _candidate_points(row) -> list[tuple[str, float, float]]:
    """Centroid first; if SoilGrids has no data there (urban/water pixel), try real nearby
    points that lie inside the same district polygon."""
    pts = [("centroid", row.lat, row.lon)]
    rp = row.geometry.representative_point()
    pts.append(("representative_point", round(rp.y, 4), round(rp.x, 4)))
    for dy, dx in ((0.05, 0), (-0.05, 0), (0, 0.05), (0, -0.05), (0.1, 0.1), (-0.1, -0.1)):
        lat, lon = round(row.lat + dy, 4), round(row.lon + dx, 4)
        if row.geometry.contains(gpd.points_from_xy([lon], [lat])[0]):
            pts.append((f"offset({dy:+},{dx:+})", lat, lon))
    return pts


def fetch_soilgrids(districts: gpd.GeoDataFrame) -> tuple[pd.DataFrame, list[str]]:
    log.info("  no local soil file -> SoilGrids v2.0 REST at district points "
             f"({', '.join(config.SOILGRIDS_PROPERTIES)}; 0-30 cm depth-weighted mean)")
    log.warning("  SoilGrids has NO phosphorus (P) or potassium (K) layers - P and K will be absent. "
                "For P/K, place a Soil Health Card district file in data/raw/soil/.")
    client = PoliteClient(config.SOILGRIDS_MIN_INTERVAL_S, timeout_s=120, logger=log)
    rows, failed = [], []
    for i, d in enumerate(districts.itertuples(), 1):
        cache = SOILGRIDS_CACHE / f"{slug(d.district)}.json"
        cached = read_json_or_none(cache)
        result = None
        if cached:
            result, how = cached, "cache"
        else:
            how = "downloaded"
            tried = []
            try:
                for method, lat, lon in _candidate_points(d):
                    params = [("lon", lon), ("lat", lat), ("value", "mean")]
                    params += [("property", p) for p in config.SOILGRIDS_PROPERTIES]
                    params += [("depth", dp) for dp in config.SOILGRIDS_DEPTHS]
                    resp = client.get(config.SOILGRIDS_URL, params=params).json()
                    parsed = _parse_soilgrids(resp)
                    tried.append(method)
                    if any(pd.notna(v) for v in parsed.values()):
                        result = {"sample_method": method, "lat": lat, "lon": lon,
                                  "tried": tried, "response": resp}
                        break
                if result is None:
                    result = {"sample_method": "no_data", "lat": d.lat, "lon": d.lon,
                              "tried": tried, "response": None}
                write_json_atomic(cache, result)
            except Exception as e:  # noqa: BLE001
                log.error(f"  [{i}/{len(districts)}] {d.district}: FAILED - {e}")
                failed.append(d.district)
                continue
        parsed = _parse_soilgrids(result["response"]) if result["response"] else {}
        rows.append({"district": d.district, **parsed, "sample_method": result["sample_method"],
                     "sample_lat": result["lat"], "sample_lon": result["lon"], "source": "SoilGrids v2.0"})
        note = "" if result["sample_method"] == "centroid" else f" [sampled at {result['sample_method']}]"
        log.info(f"  [{i}/{len(districts)}] {d.district}: ({how}){note}")
    soil = pd.DataFrame(rows)
    if not soil.empty:
        no_data = soil.loc[soil["sample_method"] == "no_data", "district"].tolist()
        if no_data:
            log.warning(f"  SoilGrids returned no data at any tried point for: {no_data} (left as NaN)")
    if failed:
        log.error(f"  SoilGrids failed for {failed} - re-run to retry")
    return soil, failed


def load_soil(districts: gpd.GeoDataFrame, state: str) -> tuple[pd.DataFrame, list[str]]:
    log.info("== 3. Soil")
    files = _data_files(RAW_SOIL)
    if files:
        log.info(f"  local soil file(s) found: {[f.name for f in files]}")
        return load_soil_local(files, state), []
    return fetch_soilgrids(districts)


# =====================================================================================
# 4. Crop yield - manual file
# =====================================================================================
CROP_SYNONYMS = {
    "state": ["state_name", "state"],
    "district": ["district_name", "district", "dist_name"],
    "year": ["crop_year", "year"],
    "crop": ["crop"],
    "season": ["season"],
    "area": ["area", "area_ha", "area_hectare"],
    "production": ["production", "production_tonnes"],
    "yield": ["yield", "yield_tonnes_ha", "yield_t_ha"],
    "area_unit": ["area_units", "area_unit"],
    "production_unit": ["production_units", "production_unit"],
    "yield_unit": ["yield_units", "yield_unit"],
}
ICRISAT_RE = re.compile(r"^(.+?)\s+(AREA|PRODUCTION|YIELD)\s*\((.+)\)\s*$", re.I)


def crop_download_instructions(state: str) -> str:
    return f"""
Crop yield data not found: data/raw/crop/ has no .csv/.xlsx file.

Download ONE of the following and save it in  data/raw/crop/  (any filename, .csv or .xlsx):

  A) data.gov.in - "District-wise, season-wise crop production statistics from 1997"   [recommended]
     https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997
     -> Download the CSV (all-India file is fine; the script filters to {state}).

  B) DES (Ministry of Agriculture) - Crop Area/Production/Yield report
     https://data.desagri.gov.in/website/crops-apy-report-web
     -> State = {state}, all districts, all crops/seasons, full year range -> export CSV/Excel.

  C) ICRISAT District Level Database (DLD) - "Area, Production and Yield"
     http://data.icrisat.org/dld/   (site did not respond when this script was written)
     Note: ICRISAT uses 1966 parent-district boundaries, so many districts will need manual mapping.

Then re-run:  python analysis/01_fetch_data.py
"""


def _detect_long(cols_norm: dict[str, str]) -> dict[str, str] | None:
    found = {}
    for key, syns in CROP_SYNONYMS.items():
        for s in syns:
            if s in cols_norm:
                found[key] = cols_norm[s]
                break
    need = {"district", "year", "crop"}
    if need <= found.keys() and ({"production", "yield"} & found.keys()):
        return found
    return None


def load_crop(state: str, start: int, end: int) -> pd.DataFrame:
    log.info("== 4. Crop yield (manual file)")
    files = _data_files(RAW_CROP)
    if not files:
        raise ManualDownloadRequired(crop_download_instructions(state))

    frames = []
    for f in files:
        raw = _read_table(f)
        log.info(f"  {f.name}: {len(raw):,} rows x {raw.shape[1]} cols")
        cols_norm = {_norm_col(c): c for c in raw.columns}
        icrisat_cols = [c for c in raw.columns if ICRISAT_RE.match(str(c))]
        mapping = _detect_long(cols_norm)
        if mapping:
            log.info(f"    format: long (data.gov.in / DES style); columns {mapping}")
            df = raw[list(mapping.values())].rename(columns={v: k for k, v in mapping.items()})
            fmt = "long"
        elif icrisat_cols and "dist_name" in cols_norm and "year" in cols_norm:
            log.info(f"    format: ICRISAT DLD wide ({len(icrisat_cols)} crop columns)")
            id_cols = {"district": cols_norm["dist_name"], "year": cols_norm["year"]}
            if "state_name" in cols_norm:
                id_cols["state"] = cols_norm["state_name"]
            m = raw.melt(id_vars=list(id_cols.values()), value_vars=icrisat_cols, var_name="col")
            parts = m["col"].str.extract(ICRISAT_RE)
            m["crop"], m["metric"], m["unit"] = parts[0].str.strip(), parts[1].str.lower(), parts[2]
            m = m.rename(columns={v: k for k, v in id_cols.items()})
            keys = [k for k in ("state", "district", "year", "crop") if k in m]
            units = m.groupby("metric")["unit"].first()
            df = (m.pivot_table(index=keys, columns="metric", values="value", aggfunc="first")
                   .reset_index().rename_axis(None, axis=1))
            for metric, unit in units.items():
                df[f"{metric}_unit"] = unit
            n_neg = int((df[["area", "production", "yield"]] == -1).sum().sum())
            df[["area", "production", "yield"]] = df[["area", "production", "yield"]].replace(-1, np.nan)
            log.info(f"    ICRISAT missing-value code -1 -> NaN: {n_neg} cells")
            fmt = "icrisat"
        else:
            raise SystemExit(
                f"Could not recognise the format of {rel(f)}.\nColumns: {list(raw.columns)}\n"
                "Expected either long format (District, Year, Crop, Area/Production/Yield ...) "
                "or ICRISAT DLD wide format ('<CROP> AREA (1000 ha)' ...). Add a loader for this format.")
        df["source_file"] = f.name
        df["format"] = fmt
        frames.append(df)

    crop = pd.concat(frames, ignore_index=True)

    # State filter
    if "state" in crop:
        states_found = sorted(crop["state"].dropna().astype(str).str.strip().unique())
        keep = crop["state"].astype(str).map(norm_state) == norm_state(state)
        if not keep.any():
            raise SystemExit(f"No rows for state '{state}' in crop file(s). States found: {states_found}")
        log.info(f"  state filter '{state}': {keep.sum():,} of {len(crop):,} rows")
        crop = crop[keep].copy()
    else:
        log.warning("  crop file has no state column - assuming it contains only "
                    f"{state} (verify!)")

    # Clean types (no imputation)
    crop["district"] = crop["district"].astype(str).str.strip()
    crop["crop"] = crop["crop"].astype(str).str.strip()
    if "season" in crop:
        crop["season"] = crop["season"].astype(str).str.strip()
    yr = crop["year"].astype(str).str.extract(r"(\d{4})")[0]
    bad_year = yr.isna().sum()
    crop["year"] = pd.to_numeric(yr, errors="coerce").astype("Int64")
    if bad_year:
        log.warning(f"  {bad_year} rows with unparseable year dropped")
        crop = crop[crop["year"].notna()]
    for c in ("area", "production", "yield"):
        if c in crop:
            crop[c] = pd.to_numeric(crop[c].astype(str).str.replace(",", "").str.strip(),
                                    errors="coerce")

    yrs_all = (int(crop["year"].min()), int(crop["year"].max()))
    in_range = crop["year"].between(start, end)
    log.info(f"  years in file {yrs_all[0]}-{yrs_all[1]}; keeping {start}-{end}: "
             f"{in_range.sum():,} of {len(crop):,} rows")
    crop = crop[in_range].copy()

    # Crop filter
    crops_found = crop["crop"].value_counts()
    if config.CROPS:
        wanted = {norm_name(c): c for c in config.CROPS}
        keep = crop["crop"].map(norm_name).isin(wanted)
        missing = [c for n, c in wanted.items() if n not in set(crop["crop"].map(norm_name))]
        if missing:
            log.warning(f"  configured crops not found in data: {missing}")
        crop = crop[keep].copy()
    else:
        log.info("  config.CROPS is empty - keeping all crops. Crops found (rows):")

    # Summary
    log.info(f"  --- crop data summary ({state}) ---")
    log.info(f"  rows: {len(crop):,} | districts: {crop['district'].nunique()} | "
             f"crops: {crop['crop'].nunique()} | years: {crop['year'].min()}-{crop['year'].max()}")
    if not config.CROPS:
        for name, n in crops_found.head(40).items():
            log.info(f"      {name:<35} {n:>6}")
        if len(crops_found) > 40:
            log.info(f"      ... and {len(crops_found) - 40} more")
    if "season" in crop:
        log.info(f"  seasons: {crop['season'].value_counts().to_dict()}")
    for u in ("area_unit", "production_unit", "yield_unit"):
        if u in crop:
            log.info(f"  {u}: {crop[u].dropna().unique().tolist()[:10]}")
    if not {"area_unit", "production_unit"} & set(crop.columns):
        log.info("  units: not stated in file - data.gov.in 1997+ file uses hectares and tonnes "
                 "(bales for cotton, nuts for coconut); confirm before modelling")
    na = {c: int(crop[c].isna().sum()) for c in ("area", "production", "yield") if c in crop}
    log.info(f"  missing values (kept as NaN): {na}")
    return crop


# =====================================================================================
# 5. District name matching
# =====================================================================================
def build_name_map(geo_names: list[str], sources: dict[str, list[str]]) -> pd.DataFrame:
    log.info("== 5. District name matching (canonical = Census 2011 map names)")
    geo_norm = {norm_name(g): g for g in geo_names}

    manual = pd.DataFrame()
    if OUT_NAME_MAP.exists():
        old = pd.read_csv(OUT_NAME_MAP, dtype=str, keep_default_na=False)
        manual = old[old["status"].str.lower() == "manual"]
        if len(manual):
            log.info(f"  keeping {len(manual)} manual mapping(s) from existing {rel(OUT_NAME_MAP)}")
    manual_keys = set(zip(manual.get("source", []), manual.get("source_name", [])))

    rows = []
    for source, names in sources.items():
        for name in sorted(set(names)):
            if (source, name) in manual_keys:
                continue
            n = norm_name(name)
            scored = sorted(((difflib.SequenceMatcher(None, n, gn).ratio(), g)
                             for gn, g in geo_norm.items()), reverse=True)
            cands = "; ".join(f"{g} ({s:.2f})" for s, g in scored[:3])
            if n in geo_norm:
                rows.append((source, name, geo_norm[n], "exact", 1.0, cands))
                continue
            best_score, best = scored[0] if scored else (0.0, "")
            # Containment (e.g. "Pauri Garhwal" vs map "Garhwal"): a strong hint, never auto-accepted.
            contained = [g for gn, g in geo_norm.items() if len(gn) >= 5 and (gn in n or n in gn)]
            if best_score < config.FUZZY_AUTO_ACCEPT and len(contained) == 1:
                rows.append((source, name, contained[0], "needs_review", round(best_score, 3),
                             f"name containment -> {contained[0]}; " + cands))
                continue
            if best_score >= config.FUZZY_AUTO_ACCEPT:
                status = "fuzzy"
            elif best_score >= config.FUZZY_SUGGEST:
                status = "needs_review"
            else:
                status, best = "unmatched", ""
            rows.append((source, name, best, status, round(best_score, 3), cands))

    auto = pd.DataFrame(rows, columns=["source", "source_name", "geo_name", "status", "score", "candidates"])
    name_map = pd.concat([manual, auto.astype(str)], ignore_index=True)
    name_map = name_map.sort_values(["source", "status", "source_name"]).reset_index(drop=True)
    name_map.to_csv(OUT_NAME_MAP, index=False)
    log.info(f"  {len(name_map)} names -> {rel(OUT_NAME_MAP)}; status counts: "
             f"{name_map['status'].value_counts().to_dict()}")

    review = name_map[name_map["status"].isin(["fuzzy", "needs_review", "unmatched"])]
    if len(review):
        log.info("")
        log.info("  ---------- MANUAL REVIEW LIST ----------")
        log.info("  fuzzy        = auto-accepted, please confirm")
        log.info("  needs_review = best guess shown, NOT used until you confirm")
        log.info("  unmatched    = no good candidate (new/split district, or a different boundary year)")
        log.info(f"  To fix: edit {rel(OUT_NAME_MAP)}, set geo_name and status=manual. "
                 "Manual rows are kept on re-run.")
        log.info("\n" + review[["source", "source_name", "status", "geo_name", "candidates"]]
                 .to_string(index=False))
    for source, names in sources.items():
        matched = set(name_map.loc[(name_map["source"] == source) &
                                   name_map["status"].isin(["exact", "fuzzy", "manual"]), "geo_name"])
        absent = sorted(set(geo_names) - matched)
        if absent:
            log.info(f"  map districts with NO {source} data: {absent}")
    return name_map


def apply_name_map(df: pd.DataFrame, name_map: pd.DataFrame, source: str, col: str) -> pd.DataFrame:
    ok = name_map[(name_map["source"] == source) & name_map["status"].isin(["exact", "fuzzy", "manual"])]
    lookup = dict(zip(ok["source_name"], ok["geo_name"]))
    df = df.copy()
    df["geo_district"] = df[col].map(lookup)
    return df


# =====================================================================================
# 6. Inventory
# =====================================================================================
def _years(s) -> str:
    s = pd.Series(s).dropna()
    return f"{int(s.min())}-{int(s.max())}" if len(s) else "-"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", default=config.STATE)
    ap.add_argument("--start", type=int, default=config.YEAR_START)
    ap.add_argument("--end", type=int, default=config.year_end())
    args = ap.parse_args()
    if not args.state:
        log.error("No state chosen. Set STATE in analysis/config.py or pass --state \"<State name>\".")
        return 2
    state, start, end = args.state, args.start, args.end
    log.info(f"KrishiRisk 01_fetch_data | state={state} | years={start}-{end}")

    districts = load_districts(state)
    n_d = len(districts)
    geo_names = districts["district"].tolist()
    inventory, problems = [], []

    inventory.append(dict(source="District boundaries (datameet Census 2011)", path=rel(OUT_DISTRICTS),
                          rows=n_d, years="2011", districts=f"{n_d}/{n_d}", status="OK"))

    clim, clim_failed = fetch_climate(districts, start, end)
    inventory.append(dict(source="Climate daily (NASA POWER)", path=rel(OUT_CLIMATE), rows=len(clim),
                          years=_years(clim["date"].dt.year) if len(clim) else "-",
                          districts=f"{clim['district'].nunique() if len(clim) else 0}/{n_d}",
                          status="OK" if not clim_failed else "PARTIAL"))
    if clim_failed:
        problems.append(f"Climate download failed for {clim_failed} - re-run to retry.")

    soil, soil_failed = load_soil(districts, state)
    name_sources: dict[str, list[str]] = {}
    if len(soil) and "district_source" in soil:  # local file: names need matching
        name_sources["soil"] = soil["district_source"].tolist()

    crop = None
    try:
        crop = load_crop(state, start, end)
        name_sources["crop"] = crop["district"].tolist()
    except ManualDownloadRequired as e:
        log.error(str(e))
        problems.append("Crop yield file missing - see download instructions above.")

    if name_sources:
        name_map = build_name_map(geo_names, name_sources)
        if "soil" in name_sources:
            soil = apply_name_map(soil, name_map, "soil", "district_source")
        if crop is not None:
            crop = apply_name_map(crop, name_map, "crop", "district")
            unmapped = crop["geo_district"].isna().sum()
            log.info(f"  crop rows without a confirmed map district: {unmapped:,} "
                     "(kept, geo_district empty)")
    else:
        log.info("== 5. District name matching: nothing to match yet (SoilGrids/climate use map names)")

    if len(soil):
        if "geo_district" not in soil:
            soil["geo_district"] = soil["district"]
        soil.to_csv(OUT_SOIL, index=False)
        log.info(f"  soil -> {rel(OUT_SOIL)}")
        value_cols = [c for c in soil if c in ("n", "p", "k", "ph", "oc", *SOILGRIDS_COLS.values())]
        has = soil[value_cols].notna().any(axis=1)
        inventory.append(dict(source=f"Soil ({soil['source'].iloc[0]})", path=rel(OUT_SOIL), rows=len(soil),
                              years="static", districts=f"{soil.loc[has, 'geo_district'].nunique()}/{n_d}",
                              status="OK" if not soil_failed else "PARTIAL"))
    else:
        inventory.append(dict(source="Soil", path="-", rows=0, years="-", districts=f"0/{n_d}", status="FAILED"))
    if soil_failed:
        problems.append(f"SoilGrids failed for {soil_failed} - re-run to retry.")

    if crop is not None:
        crop.to_csv(OUT_CROP, index=False)
        log.info(f"  crop -> {rel(OUT_CROP)}")
        inventory.append(dict(source="Crop area/production/yield", path=rel(OUT_CROP), rows=len(crop),
                              years=_years(crop["year"]),
                              districts=f"{crop['geo_district'].nunique()}/{n_d}", status="OK"))
    else:
        inventory.append(dict(source="Crop area/production/yield", path="data/raw/crop/ (MISSING)",
                              rows=0, years="-", districts=f"0/{n_d}", status="MISSING"))

    inv = pd.DataFrame(inventory)
    inv.to_csv(OUT_INVENTORY, index=False)
    log.info("")
    log.info(f"== 6. DATA INVENTORY ({state}, {n_d} districts) -> {rel(OUT_INVENTORY)}")
    log.info("\n" + inv.to_string(index=False))

    if problems:
        log.info("")
        log.error("ACTION NEEDED:")
        for p in problems:
            log.error(f"  - {p}")
        return 1
    log.info("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
