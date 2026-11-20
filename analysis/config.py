"""Project-wide settings for the KrishiRisk pipeline.

Edit STATE / CROPS here once the scope is decided. Every script reads these values;
CLI flags (e.g. --state) override them for a single run.
"""
from __future__ import annotations

import datetime as _dt

# ---- Scope (TBD: set these!) -------------------------------------------------
# State name as it appears in the Census 2011 district map (e.g. "Uttarakhand",
# "Maharashtra"). None = not chosen yet; scripts refuse to run until it is set.
STATE: str | None = None

# Crops to keep, e.g. ["Rice", "Wheat", "Maize"]. Empty list = keep all crops
# (01 prints the crops found so you can choose).
CROPS: list[str] = []

YEAR_START: int = 1997
# None = latest full calendar year.
YEAR_END: int | None = None


def year_end() -> int:
    return YEAR_END if YEAR_END is not None else _dt.date.today().year - 1


# ---- External sources ---------------------------------------------------------
# District boundaries: datameet/maps, Census 2011 districts (MIT licence on GitHub).
GEO_BASE_URL = "https://raw.githubusercontent.com/datameet/maps/master/Districts/Census_2011/"
GEO_FILES = ["2011_Dist.shp", "2011_Dist.shx", "2011_Dist.dbf", "2011_Dist.prj"]

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
NASA_POWER_PARAMS = ["PRECTOTCORR", "T2M_MAX", "T2M_MIN", "RH2M"]
NASA_POWER_MIN_INTERVAL_S = 2.0  # polite gap between requests

SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"
# SoilGrids v2.0 has NO phosphorus or potassium layers. Texture is included as it is free.
SOILGRIDS_PROPERTIES = ["nitrogen", "phh2o", "soc", "clay", "sand", "silt"]
SOILGRIDS_DEPTHS = ["0-5cm", "5-15cm", "15-30cm"]  # aggregated to a 0-30 cm weighted mean
SOILGRIDS_MIN_INTERVAL_S = 12.5  # ISRIC fair-use limit: 5 requests / minute

# ---- Name matching ----------------------------------------------------------------
FUZZY_AUTO_ACCEPT = 0.90  # >= this: accepted automatically (still listed for review)
FUZZY_SUGGEST = 0.70      # >= this: best guess written but status = needs_review
