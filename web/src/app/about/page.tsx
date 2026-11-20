import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "About",
  description: "Data sources, methods, limitations and author of KrishiRisk.",
};

const SOURCES = [
  {
    name: "District-wise crop production statistics (area, production, yield)",
    by: "Ministry of Agriculture & Farmers Welfare via data.gov.in / DES",
    href: "https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997",
  },
  {
    name: "Daily climate: precipitation, Tmax, Tmin, relative humidity",
    by: "NASA POWER (Prediction Of Worldwide Energy Resources)",
    href: "https://power.larc.nasa.gov/",
  },
  {
    name: "Soil properties: organic carbon, pH, nitrogen, texture",
    by: "ISRIC SoilGrids v2.0 (CC BY 4.0)",
    href: "https://www.isric.org/explore/soilgrids",
  },
  {
    name: "District boundaries (Census 2011)",
    by: "DataMeet community maps",
    href: "https://github.com/datameet/maps",
  },
];

const LIMITATIONS = [
  "District boundaries are from Census 2011; districts created later are matched to their 2011 parent where possible.",
  "Climate is sampled at one point per district (its centroid), not averaged over the district area.",
  "SoilGrids has no phosphorus or potassium data; when it is the soil source, the degradation score uses organic carbon, pH and nitrogen only.",
  "The risk index and categories are relative within the state (quartiles), not absolute thresholds.",
  "District-years are not independent, so reported p-values overstate certainty; correlations are not causal effects.",
  "Scenario results come from a statistical model and cannot capture adaptation, irrigation changes or new varieties; tree models do not extrapolate beyond observed climate.",
  "Some climate baselines (rainfall z-score, SPI distribution) use the full record; they use rainfall only, never yields.",
];

export default function Page() {
  return (
    <div className="space-y-4">
      <PageHeader title="About KrishiRisk"
        lead="KrishiRisk — Agricultural Yield Prediction & Climate Stress Modeling. A Data Visualization & Interpretation (DVI) final project." />

      <Card title="Data sources">
        <ul className="space-y-3">
          {SOURCES.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink hover:underline">
                {s.name}
              </a>
              <p className="text-sm text-ink-2">{s.by}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Method in brief">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>Crop statistics are cleaned (units, impossible values, outlier flags) and joined to season climate and soil.</li>
          <li>Climate features per season: rainfall and its anomaly, SPI-3, dry spells, monsoon onset delay, heat-stress days, growing degree days.</li>
          <li>Models (Linear Regression, Random Forest, XGBoost) predict yield deviation from each district&apos;s trend; evaluated on the last five years only.</li>
          <li>SHAP explains which features move predictions; their importance sets the risk-index weights.</li>
          <li>The Climate Stress Risk Index combines rainfall variability, drought frequency, heat stress, soil degradation and yield volatility.</li>
        </ol>
      </Card>

      <Card title="Limitations">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          {LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </Card>

      <Card title="Author">
        <p className="font-medium">Mayank Kumar</p>
        <p className="text-sm text-ink-2">B.Tech Computer Science &amp; Engineering, UPES Dehradun</p>
        <p className="text-sm text-ink-2">Course: Data Visualization &amp; Interpretation (DVI) — Final Project</p>
      </Card>
    </div>
  );
}
