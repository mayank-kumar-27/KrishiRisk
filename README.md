<p align="center">
  <img src="assets/brand/logo.svg" alt="KrishiRisk logo" width="96" />
</p>

# KrishiRisk — Agricultural Yield Prediction & Climate Stress Modeling

> **Predict yields. Map climate risk. Protect smallholders.**

**Live site:** https://krishirisk.vercel.app *(not deployed yet)*

Data Visualization & Interpretation (DVI) final project by **Mayank Kumar**, B.Tech CSE, UPES Dehradun.

## Problem
Unpredictable rainfall and soil degradation threaten smallholder crop yields. KrishiRisk builds
district-level yield models and climate-stress indicators to produce actionable risk assessments.

## Scope
- **Region:** districts of _[STATE — TBD]_
- **Crops:** _[CROPS — TBD]_
- **Period:** ~1997 → latest available year

## Repository layout
```
analysis/         Python pipeline (01_… → 06_…, run_all.py)
data/raw/         Source downloads (large files not committed)
data/processed/   Cleaned CSVs
web/              Next.js static site (deployed on Vercel, root dir = web)
report/figures/   Figures for the written report
assets/brand/     Logo and favicon
```

## Reproducing the analysis
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python analysis/run_all.py
```
_(Pipeline scripts not written yet.)_

## Running the website
The dashboard in `web/` is a fully static Next.js app (App Router, TypeScript, Tailwind, Recharts,
react-leaflet). It reads only the JSON files that `analysis/06_export_web.py` writes to
`web/public/data/`.

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to web/out/
```

Pages: Overview · Risk Map · Explore · What-If Simulator · Model · About.
Deploy on Vercel with **Root Directory = `web`**.

## Data sources
| Dataset | Provider | URL | Licence | Accessed |
|---|---|---|---|---|
| District boundaries (Census 2011) | DataMeet | https://github.com/datameet/maps | MIT (per GitHub) | 2026-11-20 |
| Daily climate (PRECTOTCORR, T2M_MAX, T2M_MIN, RH2M) | NASA POWER | https://power.larc.nasa.gov/ | Public domain (NASA) | 2026-11-20 |
| Soil (N, pH, SOC, texture; no P/K) | ISRIC SoilGrids v2.0 | https://rest.isric.org/soilgrids/v2.0/docs | CC BY 4.0 | 2026-11-20 |
| Crop area/production/yield | data.gov.in / DES / ICRISAT DLD | _manual download — see `analysis/01_fetch_data.py`_ | _TBD_ | _TBD_ |

## Methodology
_TBD._

## Findings
_TBD._

## Author
Mayank Kumar — B.Tech CSE, UPES Dehradun
