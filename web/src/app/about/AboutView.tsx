"use client";

import { BookOpen, CloudRain, ExternalLink, GraduationCap, Layers, MapPinned, Sprout, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";
import { Reveal } from "@/components/anim";
import { Card, PageHeader } from "@/components/ui";
import { AUTHORS, LIMITATIONS, SOURCES as SOURCE_TEXT } from "@/lib/content";

type Icon = ComponentType<{ size?: number; className?: string }>;

const SOURCE_ICONS: Record<(typeof SOURCE_TEXT)[number]["key"], Icon> = {
  crops: Sprout,
  climate: CloudRain,
  soil: Layers,
  boundaries: MapPinned,
};
const SOURCES = SOURCE_TEXT.map((s) => ({ ...s, icon: SOURCE_ICONS[s.key] }));

const METHOD = [
  { title: "Clean & join", text: "Crop statistics are cleaned (units, impossible values, outlier flags), district names matched to the map, and joined to season climate and soil." },
  { title: "Engineer climate features", text: "Per season: rainfall and its anomaly, SPI-3 drought index, dry spells, monsoon onset delay, heat-stress days and growing degree days." },
  { title: "Model & validate", text: "Linear Regression, Random Forest and XGBoost predict yield deviation from each district's trend, evaluated only on the last five years, against a trend-only baseline." },
  { title: "Explain", text: "SHAP values show which features move predictions; their importance sets the weights of the risk index." },
  { title: "Assess risk & simulate", text: "The Climate Stress Risk Index combines rainfall variability, drought frequency, heat, soil degradation and yield volatility; scenarios re-run the model on perturbed climate." },
];

export default function AboutView() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="About" icon={BookOpen} title="About KrishiRisk"
        lead="Agricultural Yield Prediction & Climate Stress Modeling: a Data Visualization & Interpretation (DVI) team project built entirely on open data and an open, reproducible pipeline."
        meta={["Open data only", "Reproducible Python pipeline", "Static site · no backend"]} />

      <section aria-labelledby="sources">
        <div className="mb-4 flex items-baseline gap-3 border-b border-line pb-3">
          <span className="font-mono text-[11px] font-semibold text-brand-ink">01 //</span>
          <h2 id="sources" className="text-xl font-semibold tracking-[-0.015em]">Data sources</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOURCES.map((s, i) => (
            <Reveal key={s.href} delay={i * 70} className="h-full">
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="card card-hover group flex h-full gap-3.5 p-4">
                <span className="icon-chip h-9 w-9 shrink-0"><s.icon size={18} /></span>
                <span>
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                    {s.name} <ExternalLink size={14} className="text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-[13px] leading-5 text-ink-2">{s.by}</span>
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      <section aria-labelledby="method">
        <div className="mb-4 flex items-baseline gap-3 border-b border-line pb-3">
          <span className="font-mono text-[11px] font-semibold text-brand-ink">02 //</span>
          <h2 id="method" className="text-xl font-semibold tracking-[-0.015em]">Method in brief</h2>
        </div>
        <div className="card p-4 sm:p-5">
          <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
            {METHOD.map((m, i) => (
              <li key={m.title} className="relative pl-12">
                <Reveal variant="left" delay={i * 90}>
                  <span className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded border border-line bg-surface font-mono text-xs font-semibold text-brand-ink">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="pt-1 text-[15px] font-semibold">{m.title}</p>
                  <p className="mt-1 text-[13px] leading-5 text-ink-2">{m.text}</p>
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
              <li key={l} className="flex gap-3 text-[13px] leading-5 text-ink-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-sm bg-brand" aria-hidden="true" />
                {l}
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>

      <Reveal>
        <div className="card flex flex-col gap-4 border-l-2 !border-l-brand p-4 sm:flex-row sm:items-center sm:p-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-brand-solid font-mono text-lg font-semibold text-white" aria-hidden="true">
            MK
          </span>
          <div>
            <p className="micro">Authors</p>
            <p className="text-lg font-semibold">{AUTHORS}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2"><GraduationCap size={16} /> B.Tech Computer Science &amp; Engineering, UPES Dehradun</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">Course: Data Visualization &amp; Interpretation (DVI) · Team Project</p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
