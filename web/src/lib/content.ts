// Static text shared by the About page and the downloadable report.

export const AUTHORS = "Mayank Kumar and team";
export const AFFILIATION = "B.Tech CSE, UPES Dehradun";
export const COURSE = "Data Visualization & Interpretation (DVI) · Team Project";

export const SOURCES: { key: "crops" | "climate" | "soil" | "boundaries"; name: string; by: string; href: string }[] = [
  { key: "crops", name: "District crop statistics", by: "Area, production and yield, 1997+ · Ministry of Agriculture & Farmers Welfare via data.gov.in", href: "https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997" },
  { key: "climate", name: "Daily climate", by: "Rainfall, max/min temperature and humidity · NASA POWER", href: "https://power.larc.nasa.gov/" },
  { key: "soil", name: "Soil properties", by: "Organic carbon, pH, nitrogen and texture · ISRIC SoilGrids v2.0 (CC BY 4.0)", href: "https://www.isric.org/explore/soilgrids" },
  { key: "boundaries", name: "District boundaries", by: "Census 2011 districts · DataMeet community maps", href: "https://github.com/datameet/maps" },
];

export const LIMITATIONS = [
  "District boundaries are from Census 2011; current official names are used (e.g. Haridwar, Pauri Garhwal), and districts created later are matched to their 2011 parent.",
  "Climate is sampled at one point per district (its centroid), not averaged over the district area.",
  "SoilGrids has no phosphorus or potassium data; the soil degradation score uses organic carbon, pH and nitrogen only.",
  "The risk index and its categories are relative within the state (quartiles), not absolute thresholds.",
  "District-years are not independent, so reported p-values overstate certainty; correlations are not causal effects.",
  "Scenarios come from a statistical model and cannot capture adaptation, irrigation changes or new varieties.",
  "Some climate baselines (rainfall z-score, SPI distribution) use the full record; they use rainfall only, never yields.",
];
