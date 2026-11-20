"use client";

import {
  ArrowRight, BrainCircuit, CalendarRange, ChartColumn, CloudRain, Database, FlaskConical, Layers, Map as MapIcon,
  MapPinned, ShieldCheck, SlidersHorizontal, Sprout, Target, ThermometerSun, TrendingUp, Wheat,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CountUp, Reveal, formatNumber } from "@/components/anim";
import { LogoMark } from "@/components/Logo";
import StateMap from "@/components/StateMap";
import { Eyebrow, NoData } from "@/components/ui";
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
  { href: "/risk-map", title: "Risk Map", text: "Which districts and crops are most exposed — and why.", icon: MapIcon },
  { href: "/explore", title: "Explore", text: "Yield trends, rainfall–yield links and climate correlations.", icon: ChartColumn },
  { href: "/simulator", title: "What-If Simulator", text: "Dial rainfall and temperature, watch yields respond.", icon: SlidersHorizontal },
  { href: "/model", title: "Model", text: "How well we predict unseen years, and what drives yield.", icon: BrainCircuit },
];

function Finding({ icon: I, eyebrow, value, suffix, title, children, delay }: {
  icon: Icon; eyebrow: string; value: ReactNode; suffix?: string; title: string; children: ReactNode; delay: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <article className="card card-hover flex h-full flex-col p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="icon-chip h-8 w-8"><I size={16} /></span>
          {eyebrow}
        </div>
        <p className="font-display mt-4 text-5xl font-extrabold tracking-tight">
          <span className="text-gradient">{value}</span>
          {suffix && <span className={`${suffix.startsWith("%") ? "ml-0.5" : "ml-1"} text-2xl font-bold text-ink-2`}>{suffix}</span>}
        </p>
        <h3 className="font-display mt-3 text-lg font-bold leading-snug">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{children}</p>
      </article>
    </Reveal>
  );
}

function SectionTitle({ eyebrow, title, lead }: { eyebrow: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <Reveal className="mb-8 max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-ink">{eyebrow}</p>
      <h2 className="font-display mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {lead && <p className="mt-3 text-base leading-relaxed text-ink-2 sm:text-lg">{lead}</p>}
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

  return (
    <div className="space-y-24 sm:space-y-28">
      {/* ---------------- Hero ---------------- */}
      <section className="relative isolate pt-2 sm:pt-6">
        <div aria-hidden="true" className="bg-grid absolute inset-x-0 -top-10 -z-10 h-[34rem]" />
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="hero-in">
            <Eyebrow>DVI Final Project · {state}</Eyebrow>
            <h1 className="font-display mt-5 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-[4.1rem]">
              Predict yields.
              <br />
              <span className="text-gradient">Map climate risk.</span>
              <br />
              Protect smallholders.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              Erratic rainfall and degrading soils threaten the farmers with the least buffer against a bad season.
              KrishiRisk fuses district crop statistics with daily satellite-era climate and soil data to show where
              crops are most exposed, what drives the risk, and what a drier or hotter season would do to yields.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/risk-map"
                className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
                style={{ background: "linear-gradient(100deg, var(--brand), var(--accent))" }}
              >
                Open the risk map
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/simulator"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold shadow-sm transition-colors hover:border-ink-2/40"
              >
                <SlidersHorizontal size={16} /> Try a what-if scenario
              </Link>
            </div>
            {s && (
              <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                {[
                  { icon: MapPinned, k: "Districts", v: String(s.districts) },
                  { icon: Wheat, k: "Crops", v: s.crops.join(" · ") },
                  { icon: CalendarRange, k: "Crop years", v: yearSpan },
                ].map((x) => (
                  <div key={x.k} className="flex items-center gap-2">
                    <x.icon size={16} className="text-brand-ink" />
                    <dt className="text-muted">{x.k}</dt>
                    <dd className="font-semibold">{x.v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="relative">
            <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-70 blur-3xl"
              style={{ background: "radial-gradient(closest-side, var(--glow-1), transparent), radial-gradient(closest-side at 70% 60%, var(--glow-2), transparent)" }} />
            <div className="card relative p-4 sm:p-6">
              {geo.data && s ? (
                <>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-display text-sm font-bold">Climate Stress Risk · all crops</p>
                    <Link href="/risk-map" className="text-xs font-semibold text-accent-ink hover:underline">Explore →</Link>
                  </div>
                  <StateMap
                    geo={geo.data}
                    ariaLabel={`Map of ${state} districts coloured by climate stress risk`}
                    fill={(d) => (d.risk_category ? p.risk[d.risk_category] : null)}
                    label={(d) => (d.district === h?.top_district.district ? d.district : null)}
                    tooltip={(d) => (
                      <>
                        <strong className="text-sm">{d.district}</strong>
                        <br />
                        {d.risk_index == null ? "No data" : `Risk ${Math.round(d.risk_index)}/100 · ${d.risk_category}`}
                        {d.driver && <><br />Top driver: {d.driver}</>}
                      </>
                    )}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-2">
                    {CATEGORIES.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.risk[c] }} aria-hidden="true" />
                        {c}
                      </span>
                    ))}
                  </div>
                  {h && (
                    <>
                      <div className="float absolute -right-3 top-14 hidden rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-lift)] backdrop-blur sm:block">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Highest risk</p>
                        <p className="font-display text-lg font-extrabold">{h.top_district.district}</p>
                        <p className="text-xs text-ink-2">Score {Math.round(h.top_district.index)}/100 · {h.top_district.category}</p>
                      </div>
                      <div className="float-slow absolute -left-3 bottom-14 hidden rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-lift)] backdrop-blur sm:block">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Severe pairs</p>
                        <p className="font-display text-lg font-extrabold">{s.severe_pairs} <span className="text-sm font-semibold text-ink-2">of {s.district_crop_pairs}</span></p>
                        <p className="text-xs text-ink-2">district × crop combinations</p>
                      </div>
                    </>
                  )}
                </>
              ) : geo.error || error ? (
                <div className="grid place-items-center py-16"><LogoMark size={160} /></div>
              ) : (
                <div className="skeleton h-[420px] w-full" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>
      </section>

      {!s && error && <NoData error={error} />}

      {/* ---------------- By the numbers ---------------- */}
      {s && r && (
        <section aria-labelledby="numbers">
          <SectionTitle eyebrow="By the numbers" title={<span id="numbers">Built on real, open data — at scale</span>}
            lead="Every figure on this site is computed by an open, reproducible Python pipeline. Nothing is typed in by hand." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: CloudRain, label: "Daily climate records", value: r.climate_daily_records, note: r.climate_years ? `NASA POWER rainfall, temperature & humidity, ${r.climate_years[0]}–${r.climate_years[1]}` : "NASA POWER" },
              { icon: Sprout, label: "District-year crop records", value: r.district_year_records, note: `${s.crops.join(", ")} · ${yearSpan} (data.gov.in)` },
              { icon: SlidersHorizontal, label: "What-if predictions", value: r.scenario_predictions, note: `${r.scenarios} rainfall × temperature scenarios for ${r.district_crop_pairs} district-crop pairs` },
              { icon: MapPinned, label: "Districts mapped", value: s.districts, note: "Every district of the state, Census 2011 boundaries" },
              { icon: FlaskConical, label: "Climate & soil features", value: r.model_features, note: "SPI-3, dry spells, monsoon onset, heat days, GDD, soil score…" },
              { icon: BrainCircuit, label: "Models compared", value: r.models_compared, note: "Including an honest trend-only baseline" },
            ].map((x, i) =>
              x.value == null ? null : (
                <Reveal key={x.label} delay={i * 70} className="h-full">
                  <div className="card card-hover h-full p-6">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink-2">
                      <span className="icon-chip h-8 w-8"><x.icon size={16} /></span>
                      {x.label}
                    </div>
                    <p className="font-display mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
                      <CountUp value={x.value} />
                    </p>
                    <p className="mt-2 text-sm text-muted">{x.note}</p>
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
          <SectionTitle eyebrow="What the data says" title={<span id="findings">Six findings from {state}</span>}
            lead="Computed from the risk index, the yield model and the climate record — click through to the dashboard for the detail behind each." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Finding delay={0} icon={MapPinned} eyebrow="Most at-risk district" value={<CountUp value={h.top_district.index} />} suffix="/100"
              title={`${h.top_district.district} is the most climate-stressed district`}>
              {h.top_district.category} risk on the area-weighted index{h.top_district.driver ? `, driven mostly by ${h.top_district.driver.toLowerCase()}` : ""}.
              {h.severe_districts.length > 1 && ` Also Severe: ${h.severe_districts.filter((d) => d !== h.top_district.district).join(", ")}.`}
            </Finding>
            <Finding delay={80} icon={Wheat} eyebrow="Most stressed crop" value={<CountUp value={h.top_crop.mean_index} />} suffix="/100 avg"
              title={`${h.top_crop.crop} carries the highest climate stress`}>
              Average risk across {h.top_crop.districts} districts; rated Severe in {h.top_crop.severe_districts} of them.
            </Finding>
            {h.monsoon_share_pct != null && (
              <Finding delay={160} icon={CloudRain} eyebrow="Monsoon dependence" value={<CountUp value={h.monsoon_share_pct} />} suffix="%"
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
              <Finding delay={80} icon={Target} eyebrow="Worst case scenario" value={<CountUp value={h.worst_scenario.pct} decimals={1} signed />} suffix="%"
                title={`Largest predicted drop: ${h.worst_scenario.district} ${h.worst_scenario.crop.toLowerCase()} under −40% rain and +3 °C`}>
                Even the harshest simulated season moves predicted yields only modestly — with {nYears} years of yield data the model
                finds weak climate signals beyond each district&apos;s trend. An honest limitation, detailed on the Model page.
              </Finding>
            )}
            {bestTrend && (
              <Finding delay={160} icon={TrendingUp} eyebrow="Long-term trend" value={<CountUp value={bestTrend[1]} decimals={1} signed />} suffix="%/yr"
                title={`${bestTrend[0]} yields changed fastest, ${yearSpan}`}>
                State-wide yield trend (total production ÷ area). Weather explains the swings around these trends.
              </Finding>
            )}
          </div>
        </section>
      )}

      {/* ---------------- Pipeline ---------------- */}
      <section aria-labelledby="pipeline">
        <SectionTitle eyebrow="How it works" title={<span id="pipeline">From raw data to decisions in six steps</span>}
          lead="A transparent pipeline — every step is a script in the repository and can be re-run end to end." />
        <Reveal>
          <div className="relative">
            <div aria-hidden="true" className="reveal-line absolute left-6 right-6 top-7 hidden h-[2px] lg:block"
              style={{ background: "linear-gradient(90deg, var(--brand), var(--sky), var(--accent))" }} />
            <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {PIPELINE.map((st, i) => (
                <li key={st.step}>
                  <Reveal delay={i * 90} className="h-full">
                    <div className="card card-hover h-full p-4">
                      <span className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl text-white shadow-md"
                        style={{ background: "linear-gradient(135deg, var(--brand), var(--accent))" }}>
                        <st.icon size={22} />
                      </span>
                      <p className="mt-4 text-xs font-bold text-brand-ink">STEP {st.step}</p>
                      <p className="font-display font-bold">{st.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-2">{st.text}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </section>

      {/* ---------------- Destinations ---------------- */}
      <section aria-labelledby="explore-cta">
        <SectionTitle eyebrow="Dive in" title={<span id="explore-cta">Explore the dashboard</span>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DESTINATIONS.map((d, i) => (
            <Reveal key={d.href} delay={i * 80} className="h-full">
              <Link href={d.href} className="card card-hover group flex h-full flex-col p-6">
                <span className="icon-chip h-11 w-11"><d.icon size={20} /></span>
                <span className="font-display mt-5 text-lg font-bold">{d.title}</span>
                <span className="mt-1 flex-1 text-sm text-ink-2">{d.text}</span>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent-ink">
                  Open <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10">
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-ink" />
            Honest by design: models are tested on years they never saw, compared against a trend-only baseline, and
            the Model page shows exactly where predictions fall short.
          </p>
        </Reveal>
      </section>
    </div>
  );
}
