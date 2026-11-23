"use client";

import {
  ArrowRight, ArrowUpRight, BrainCircuit, CalendarRange, ChartColumn, CloudRain, Database, FlaskConical, Layers,
  Map as MapIcon, MapPinned, ShieldCheck, SlidersHorizontal, Sprout, Target, ThermometerSun, TrendingUp, Wheat,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CountUp, Reveal, formatNumber } from "@/components/anim";
import { LogoMark } from "@/components/Logo";
import StateMap from "@/components/StateMap";
import { CategoryBadge, Eyebrow, NoData } from "@/components/ui";
import { useData } from "@/lib/data";
import { CATEGORIES, usePalette } from "@/lib/theme";
import type { DistrictsGeo, Summary } from "@/lib/types";

type Icon = ComponentType<{ size?: number; className?: string }>;

const PIPELINE: { step: string; title: string; text: string; icon: Icon }[] = [
  { step: "01", title: "Fetch", text: "Crop statistics, NASA POWER daily climate, SoilGrids soil, district boundaries", icon: Database },
  { step: "02", title: "Engineer", text: "Season rainfall, SPI-3 drought index, dry spells, monsoon onset, heat days, GDD, soil score", icon: FlaskConical },
  { step: "03", title: "Explore", text: "Trends, correlations and rainfall-category comparisons", icon: ChartColumn },
  { step: "04", title: "Model", text: "Time-split Linear / Random Forest / XGBoost, explained with SHAP", icon: BrainCircuit },
  { step: "05", title: "Assess risk", text: "Climate Stress Risk Index, risk profiles, rainfall × heat scenarios", icon: Target },
  { step: "06", title: "Visualise", text: "Static JSON powering this dashboard", icon: Layers },
];

const DESTINATIONS: { href: string; title: string; text: string; icon: Icon }[] = [
  { href: "/risk-map", title: "Risk Map", text: "Which districts and crops are most exposed, and why.", icon: MapIcon },
  { href: "/explore", title: "Explore", text: "Yield trends, rainfall–yield links and climate correlations.", icon: ChartColumn },
  { href: "/simulator", title: "What-If Simulator", text: "Dial rainfall and temperature, watch yields respond.", icon: SlidersHorizontal },
  { href: "/model", title: "Model", text: "How well we predict unseen years, and what drives yield.", icon: BrainCircuit },
];

function Finding({ icon: I, eyebrow, value, suffix, title, children, delay }: {
  icon: Icon; eyebrow: string; value: ReactNode; suffix?: string; title: string; children: ReactNode; delay: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <article className="card card-hover flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="micro pt-1">{eyebrow}</p>
          <span className="icon-chip h-7 w-7 shrink-0"><I size={15} /></span>
        </div>
        <p className="num mt-3 text-4xl font-semibold leading-10 text-brand-ink">
          {value}
          {suffix && <span className={`${suffix.startsWith("%") ? "ml-0.5" : "ml-1"} text-base font-medium text-muted`}>{suffix}</span>}
        </p>
        <h3 className="mt-3 text-base font-semibold leading-6 tracking-[-0.01em]">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-2">{children}</p>
      </article>
    </Reveal>
  );
}

function SectionTitle({ eyebrow, title, lead }: { eyebrow: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <Reveal className="mb-5 flex flex-col gap-1 border-b border-line pb-4">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-ink">{eyebrow}</p>
      <h2 className="text-2xl font-semibold leading-8 tracking-[-0.02em]">{title}</h2>
      {lead && <p className="max-w-3xl text-[14px] leading-6 text-ink-2">{lead}</p>}
    </Reveal>
  );
}

export default function OverviewView() {
  const { data: s, error } = useData<Summary>("summary.json");
  const geo = useData<DistrictsGeo>("districts.geojson");
  const p = usePalette();
  const r = s?.records;
  const h = s?.highlights;
  const state = s?.state ?? "India";
  const yearSpan = s ? `${s.years[0]}–${s.years[1]}` : "";
  const nYears = s ? s.years[1] - s.years[0] + 1 : 0;
  const bestTrend = h ? Object.entries(h.yield_trend_pct_per_year).sort((a, b) => b[1] - a[1])[0] : undefined;
  const cutoffs = s?.district_category_cutoffs;

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate">
        <div aria-hidden="true" className="bg-grid absolute inset-x-0 -top-6 -z-10 h-[30rem]" />
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-10">
          <div className="hero-in pt-2 lg:pt-8">
            <Eyebrow>DVI Team Project · {state}</Eyebrow>
            <h1 className="mt-4 text-[34px] font-semibold leading-[40px] tracking-[-0.03em] sm:text-5xl sm:leading-[56px] lg:text-[56px] lg:leading-[62px]">
              Predict yields.
              <br />
              <span className="text-brand-ink">Map climate risk.</span>
              <br />
              Protect smallholders.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-6 text-ink-2">
              Erratic rainfall and degrading soils threaten the farmers with the least buffer against a bad season.
              KrishiRisk fuses district crop statistics with daily satellite-era climate and soil data to show where
              crops are most exposed, what drives the risk, and what a drier or hotter season would do to yields.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/risk-map" className="btn btn-primary group">
                <MapIcon size={15} /> Open the risk map
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/simulator" className="btn btn-ghost">
                <SlidersHorizontal size={15} /> Try a what-if scenario
              </Link>
            </div>
            {s && (
              <dl className="mt-7 grid max-w-xl grid-cols-1 overflow-hidden rounded-md border border-line bg-surface sm:grid-cols-3">
                {[
                  { icon: MapPinned, k: "Districts", v: String(s.districts) },
                  { icon: Wheat, k: "Crops", v: s.crops.join(" · ") },
                  { icon: CalendarRange, k: "Crop years", v: yearSpan },
                ].map((x, i) => (
                  <div key={x.k} className={`flex flex-col gap-1 px-3.5 py-2.5 ${i ? "border-t border-line sm:border-l sm:border-t-0" : ""}`}>
                    <dt className="micro flex items-center gap-1.5"><x.icon size={12} className="text-brand-ink" />{x.k}</dt>
                    <dd className="num text-[13px] font-semibold text-ink">{x.v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="card relative p-3 sm:p-4">
            {geo.data && s ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                  <div>
                    <p className="micro">Climate Stress Risk Index</p>
                    <p className="text-[13px] font-semibold">All crops · area-weighted · {s.districts} districts</p>
                  </div>
                  <Link href="/risk-map" className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 font-mono text-[11px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                    Inspect <ArrowUpRight size={12} />
                  </Link>
                </div>
                <div className="map-canvas relative p-2 sm:p-4">
                  <StateMap
                    geo={geo.data}
                    ariaLabel={`Map of ${state} districts coloured by climate stress risk`}
                    fill={(d) => (d.risk_category ? p.risk[d.risk_category] : null)}
                    label={(d) => (d.district === h?.top_district.district ? d.district : null)}
                    tooltip={(d) => (
                      <>
                        <strong className="text-[13px]">{d.district}</strong>
                        <br />
                        <span className="font-mono">{d.risk_index == null ? "No data" : `Risk ${Math.round(d.risk_index)}/100 · ${d.risk_category}`}</span>
                        {d.driver && <><br />Top driver: {d.driver}</>}
                      </>
                    )}
                  />
                  {h && (
                    <div className="float absolute right-2 top-2 hidden w-52 rounded-md border border-line-strong bg-surface/95 p-3 shadow-[var(--shadow-lift)] backdrop-blur sm:block">
                      <div className="flex items-center justify-between gap-2">
                        <p className="micro">Highest risk</p>
                        <CategoryBadge category={h.top_district.category} color={p.risk[h.top_district.category]} />
                      </div>
                      <p className="mt-1.5 text-base font-semibold">{h.top_district.district}</p>
                      <p className="num text-xs text-ink-2">Score {Math.round(h.top_district.index)}/100</p>
                    </div>
                  )}
                </div>
                {/* Risk classification legend */}
                <div className="mt-3 grid grid-cols-2 gap-2 px-1 sm:grid-cols-5" aria-label="Legend">
                  {CATEGORIES.map((c) => (
                    <div key={c}>
                      <span className="block h-1.5 rounded-sm" style={{ background: p.risk[c] }} aria-hidden="true" />
                      <p className="mt-1 text-[11px] font-semibold">{c}</p>
                      {cutoffs?.[c] && <p className="num text-[11px] text-muted">{Math.round(cutoffs[c][0])}–{Math.round(cutoffs[c][1])}</p>}
                    </div>
                  ))}
                  {h && (
                    <div className="col-span-2 rounded border border-line bg-surface-2 px-2 py-1.5 sm:col-span-1">
                      <p className="micro">Severe pairs</p>
                      <p className="num text-[13px] font-semibold">{s.severe_pairs}<span className="text-muted">/{s.district_crop_pairs}</span></p>
                    </div>
                  )}
                </div>
              </>
            ) : geo.error || error ? (
              <div className="grid place-items-center py-16"><LogoMark size={160} /></div>
            ) : (
              <div className="skeleton h-[420px] w-full" aria-hidden="true" />
            )}
          </div>
        </div>
      </section>

      {!s && error && <NoData error={error} />}

      {/* ---------------- By the numbers ---------------- */}
      {s && r && (
        <section aria-labelledby="numbers">
          <SectionTitle eyebrow="01 // By the numbers" title={<span id="numbers">Built on real, open data at scale</span>}
            lead="Every figure on this site is computed by an open, reproducible Python pipeline. Nothing is typed in by hand." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: CloudRain, label: "Daily climate records", value: r.climate_daily_records, note: r.climate_years ? `NASA POWER rainfall, temperature & humidity, ${r.climate_years[0]}–${r.climate_years[1]}` : "NASA POWER" },
              { icon: Sprout, label: "District-year crop records", value: r.district_year_records, note: `${s.crops.join(", ")} · ${yearSpan} (data.gov.in)` },
              { icon: SlidersHorizontal, label: "What-if predictions", value: r.scenario_predictions, note: `${r.scenarios} rainfall × temperature scenarios for ${r.district_crop_pairs} district-crop pairs` },
              { icon: MapPinned, label: "Districts mapped", value: s.districts, note: "Every district of the state, Census 2011 boundaries" },
              { icon: FlaskConical, label: "Climate & soil features", value: r.model_features, note: "SPI-3, dry spells, monsoon onset, heat days, GDD, soil score…" },
              { icon: BrainCircuit, label: "Models compared", value: r.models_compared, note: "Including an honest trend-only baseline" },
            ].map((x, i) =>
              x.value == null ? null : (
                <Reveal key={x.label} delay={i * 50} className="h-full">
                  <div className="card card-hover h-full p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="micro pt-0.5">{x.label}</p>
                      <span className="icon-chip h-7 w-7 shrink-0"><x.icon size={15} /></span>
                    </div>
                    <p className="num mt-3 text-[32px] font-semibold leading-9">
                      <CountUp value={x.value} />
                    </p>
                    <p className="mt-1.5 text-xs leading-[18px] text-muted">{x.note}</p>
                  </div>
                </Reveal>
              ),
            )}
          </div>
        </section>
      )}

      {/* ---------------- Findings ---------------- */}
      {s && h && (
        <section aria-labelledby="findings">
          <SectionTitle eyebrow="02 // What the data says" title={<span id="findings">Six findings from {state}</span>}
            lead="Computed from the risk index, the yield model and the climate record, click through to the dashboard for the detail behind each." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Finding delay={0} icon={MapPinned} eyebrow="Most at-risk district" value={<CountUp value={h.top_district.index} />} suffix="/100"
              title={`${h.top_district.district} is the most climate-stressed district`}>
              {h.top_district.category} risk on the area-weighted index{h.top_district.driver ? `, driven mostly by ${h.top_district.driver.toLowerCase()}` : ""}.
              {h.severe_districts.length > 1 && ` Also Severe: ${h.severe_districts.filter((d) => d !== h.top_district.district).join(", ")}.`}
            </Finding>
            <Finding delay={60} icon={Wheat} eyebrow="Most stressed crop" value={<CountUp value={h.top_crop.mean_index} />} suffix="/100 avg"
              title={`${h.top_crop.crop} carries the highest climate stress`}>
              Average risk across {h.top_crop.districts} districts; rated Severe in {h.top_crop.severe_districts} of them.
            </Finding>
            {h.monsoon_share_pct != null && (
              <Finding delay={120} icon={CloudRain} eyebrow="Monsoon dependence" value={<CountUp value={h.monsoon_share_pct} />} suffix="%"
                title="of all rain falls between June and September">
                A late or weak monsoon therefore hits Kharif crops hardest.
                {h.drought_season_pct != null && ` Drought-level seasons (SPI-3 below −1) occurred in ${formatNumber(h.drought_season_pct)}% of district-seasons.`}
              </Finding>
            )}
            {h.top_driver && (
              <Finding delay={0} icon={ThermometerSun} eyebrow="Strongest yield driver" value={<CountUp value={h.top_driver.mean_abs_shap_pct} decimals={1} />} suffix="%"
                title={`${h.top_driver.label} moves yields the most`}>
                Average effect on a season&apos;s yield (as a share of the expected trend yield), from the model&apos;s SHAP explanations.
              </Finding>
            )}
            {h.worst_scenario && (
              <Finding delay={60} icon={Target} eyebrow="Worst case scenario" value={<CountUp value={h.worst_scenario.pct} decimals={1} signed />} suffix="%"
                title={`Largest predicted drop: ${h.worst_scenario.district} ${h.worst_scenario.crop.toLowerCase()} under −40% rain and +3 °C`}>
                Even the harshest simulated season moves predicted yields only modestly: with {nYears} years of yield data the model
                finds weak climate signals beyond each district&apos;s trend. An honest limitation, detailed on the Model page.
              </Finding>
            )}
            {bestTrend && (
              <Finding delay={120} icon={TrendingUp} eyebrow="Long-term trend" value={<CountUp value={bestTrend[1]} decimals={1} signed />} suffix="%/yr"
                title={`${bestTrend[0]} yields changed fastest, ${yearSpan}`}>
                State-wide yield trend (total production ÷ area). Weather explains the swings around these trends.
              </Finding>
            )}
          </div>
        </section>
      )}

      {/* ---------------- Pipeline ---------------- */}
      <section aria-labelledby="pipeline">
        <SectionTitle eyebrow="03 // How it works" title={<span id="pipeline">From raw data to decisions in six steps</span>}
          lead="A transparent pipeline: every step is a script in the repository and can be re-run end to end." />
        <Reveal>
          <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-6">
            {PIPELINE.map((st, i) => (
              <li key={st.step} className="relative bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-brand-ink">{st.step}{" //"}</span>
                  <st.icon size={16} className="text-muted" />
                </div>
                <p className="mt-3 text-[15px] font-semibold">{st.title}</p>
                <p className="mt-1 text-xs leading-[18px] text-ink-2">{st.text}</p>
                <span aria-hidden="true" className="reveal-line absolute inset-x-0 bottom-0 h-0.5 bg-brand" style={{ transitionDelay: `${i * 120}ms` }} />
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* ---------------- Destinations ---------------- */}
      <section aria-labelledby="explore-cta">
        <SectionTitle eyebrow="04 // Dive in" title={<span id="explore-cta">Explore the dashboard</span>} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DESTINATIONS.map((d, i) => (
            <Reveal key={d.href} delay={i * 60} className="h-full">
              <Link href={d.href} className="card card-hover group flex h-full flex-col p-4">
                <span className="icon-chip h-9 w-9"><d.icon size={18} /></span>
                <span className="mt-4 text-base font-semibold">{d.title}</span>
                <span className="mt-1 flex-1 text-[13px] leading-5 text-ink-2">{d.text}</span>
                <span className="mt-4 inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-brand-ink">
                  Open module <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-6">
          <p className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-4 py-3 text-[13px] leading-5 text-ink-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-ink" />
            Honest by design: models are tested on years they never saw, compared against a trend-only baseline, and
            the Model page shows exactly where predictions fall short.
          </p>
        </Reveal>
      </section>
    </div>
  );
}
