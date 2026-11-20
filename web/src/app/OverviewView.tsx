"use client";

import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { Card, Loading, NoData, Warning } from "@/components/ui";
import { useData } from "@/lib/data";
import { fmt, signed } from "@/lib/stats";
import type { Summary } from "@/lib/types";

const PIPELINE = [
  { step: "01", title: "Fetch", text: "Crop statistics, NASA POWER daily climate, SoilGrids soil, district boundaries" },
  { step: "02", title: "Features", text: "Season rainfall, SPI-3, dry spells, monsoon onset, heat days, GDD, soil score" },
  { step: "03", title: "Explore", text: "Trends, correlations and rainfall-category comparisons" },
  { step: "04", title: "Model", text: "Time-split Linear / Random Forest / XGBoost, explained with SHAP" },
  { step: "05", title: "Risk", text: "Climate Stress Risk Index, risk profiles, rainfall × heat scenarios" },
  { step: "06", title: "Dashboard", text: "Static JSON → this site" },
];

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default function OverviewView() {
  const { data: s, loading, error } = useData<Summary>("summary.json");
  const where = s?.state ? `districts of ${s.state}` : "the study districts";
  const span = s ? `${s.years[1] - s.years[0] + 1} years (${s.years[0]}–${s.years[1]})` : "years";
  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <p className="text-sm font-medium text-accent-ink">Agricultural Yield Prediction &amp; Climate Stress Modeling</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Predict yields. Map climate risk. Protect smallholders.
          </h1>
          <p className="mt-4 max-w-2xl text-ink-2">
            Unpredictable rainfall and soil degradation threaten the yields of smallholder farmers, who have the least
            buffer against a bad season. KrishiRisk combines {span} of district crop statistics with daily climate
            and soil data for {where} to show where crops are most exposed to climate stress, what drives it, and what a
            drier or hotter season would do to yields.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/risk-map" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Open the risk map
            </Link>
            <Link href="/simulator" className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-line/50">
              Try a what-if scenario
            </Link>
          </div>
        </div>
        <div className="hidden justify-center lg:flex" aria-hidden="true">
          <LogoMark size={180} />
        </div>
      </section>

      <section aria-labelledby="kpis">
        <h2 id="kpis" className="sr-only">Headline numbers</h2>
        {loading ? <Loading /> : !s ? <NoData error={error} /> : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Districts analysed" value={String(s.districts)}
                note={`${s.crops.join(", ")} · ${s.years[0]}–${s.years[1]}`} />
              <Kpi label="District-crop pairs at Severe risk" value={`${s.severe_pairs} / ${s.district_crop_pairs}`}
                note="Most-stressed quarter of the Climate Stress Risk Index" />
              <Kpi label="Highest-risk district" value={s.highest_risk_district.district}
                note={`Index ${fmt(s.highest_risk_district.index, 0)} · ${s.highest_risk_district.category}`} />
              <Kpi label="Yield change if rainfall falls 20%" value={`${signed(s.scenario_state_pct["rain_-20"])}%`}
                note={`State average, ${s.model.name} scenario model`} />
            </div>
            {!s.model.beats_trend_only_cv && (
              <div className="mt-4">
                <Warning>
                  The yield model did not beat a trend-only forecast in cross-validation, so scenario numbers are
                  indicative only. See the Model page.
                </Warning>
              </div>
            )}
          </>
        )}
      </section>

      <Card title="How it works">
        <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
          {PIPELINE.map((p, i) => (
            <li key={p.step} className="flex flex-1 items-stretch gap-2 md:flex-col">
              <div className="flex-1 rounded-lg border border-line p-3">
                <p className="text-xs font-semibold text-accent-ink">{p.step}</p>
                <p className="font-medium">{p.title}</p>
                <p className="mt-1 text-xs text-ink-2">{p.text}</p>
              </div>
              {i < PIPELINE.length - 1 && (
                <span className="self-center text-muted md:hidden" aria-hidden="true">↓</span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-ink-2">
          Every number on this site is produced by the open Python pipeline in the repository; nothing is entered by
          hand. Models are evaluated on the most recent five years, which they never see during training.
        </p>
      </Card>
    </div>
  );
}
