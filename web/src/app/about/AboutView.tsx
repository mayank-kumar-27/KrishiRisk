"use client";

import { BookOpen, CloudRain, ExternalLink, GraduationCap, Layers, MapPinned, Sprout, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";
import { Reveal } from "@/components/anim";
import { Card, PageHeader } from "@/components/ui";

type Icon = ComponentType<{ size?: number; className?: string }>;

const SOURCES: { name: string; by: string; href: string; icon: Icon }[] = [
  { name: "District crop statistics", by: "Area, production and yield, 1997+ — Ministry of Agriculture & Farmers Welfare via data.gov.in", href: "https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997", icon: Sprout },
  { name: "Daily climate", by: "Rainfall, max/min temperature and humidity — NASA POWER", href: "https://power.larc.nasa.gov/", icon: CloudRain },
  { name: "Soil properties", by: "Organic carbon, pH, nitrogen and texture — ISRIC SoilGrids v2.0 (CC BY 4.0)", href: "https://www.isric.org/explore/soilgrids", icon: Layers },
  { name: "District boundaries", by: "Census 2011 districts — DataMeet community maps", href: "https://github.com/datameet/maps", icon: MapPinned },
];

const METHOD = [
  { title: "Clean & join", text: "Crop statistics are cleaned (units, impossible values, outlier flags), district names matched to the map, and joined to season climate and soil." },
  { title: "Engineer climate features", text: "Per season: rainfall and its anomaly, SPI-3 drought index, dry spells, monsoon onset delay, heat-stress days and growing degree days." },
  { title: "Model & validate", text: "Linear Regression, Random Forest and XGBoost predict yield deviation from each district's trend — evaluated only on the last five years, against a trend-only baseline." },
  { title: "Explain", text: "SHAP values show which features move predictions; their importance sets the weights of the risk index." },
  { title: "Assess risk & simulate", text: "The Climate Stress Risk Index combines rainfall variability, drought frequency, heat, soil degradation and yield volatility; scenarios re-run the model on perturbed climate." },
];

const LIMITATIONS = [
  "District boundaries are from Census 2011; current official names are used (e.g. Haridwar, Pauri Garhwal), and districts created later are matched to their 2011 parent.",
  "Climate is sampled at one point per district (its centroid), not averaged over the district area.",
  "SoilGrids has no phosphorus or potassium data; the soil degradation score uses organic carbon, pH and nitrogen only.",
  "The risk index and its categories are relative within the state (quartiles), not absolute thresholds.",
  "District-years are not independent, so reported p-values overstate certainty; correlations are not causal effects.",
  "Scenarios come from a statistical model and cannot capture adaptation, irrigation changes or new varieties.",
  "Some climate baselines (rainfall z-score, SPI distribution) use the full record; they use rainfall only, never yields.",
];

export default function AboutView() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="About" icon={BookOpen} title="About KrishiRisk"
        lead="Agricultural Yield Prediction & Climate Stress Modeling — a Data Visualization & Interpretation (DVI) final project built entirely on open data and an open, reproducible pipeline." />

      <section aria-labelledby="sources">
        <h2 id="sources" className="font-display mb-4 text-2xl font-extrabold">Data sources</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOURCES.map((s, i) => (
            <Reveal key={s.href} delay={i * 70} className="h-full">
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="card card-hover group flex h-full gap-4 p-5">
                <span className="icon-chip h-11 w-11 shrink-0"><s.icon size={20} /></span>
                <span>
                  <span className="font-display flex items-center gap-1.5 font-bold">
                    {s.name} <ExternalLink size={14} className="text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-sm text-ink-2">{s.by}</span>
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      <section aria-labelledby="method">
        <h2 id="method" className="font-display mb-4 text-2xl font-extrabold">Method in brief</h2>
        <div className="card p-6">
          <ol className="relative space-y-6 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-[2px] before:rounded-full before:bg-line">
            {METHOD.map((m, i) => (
              <li key={m.title} className="relative pl-12">
                <Reveal variant="left" delay={i * 90}>
                  <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-sm font-bold text-white shadow-md"
                    style={{ background: "linear-gradient(135deg, var(--brand), var(--accent))" }}>
                    {i + 1}
                  </span>
                  <p className="font-display font-bold">{m.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{m.text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Reveal>
        <Card title="Limitations" subtitle="What these results can and cannot tell you" icon={TriangleAlert}>
          <ul className="space-y-2.5">
            {LIMITATIONS.map((l) => (
              <li key={l} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                {l}
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>

      <Reveal>
        <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, var(--brand), var(--accent))" }} aria-hidden="true">
            MK
          </span>
          <div>
            <p className="font-display text-xl font-extrabold">Mayank Kumar &amp; Team</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-2"><GraduationCap size={16} /> B.Tech Computer Science &amp; Engineering, UPES Dehradun</p>
            <p className="mt-0.5 text-sm text-ink-2">Course: Data Visualization &amp; Interpretation (DVI) — Team Project</p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
