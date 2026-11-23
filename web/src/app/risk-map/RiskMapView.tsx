"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Flame, Layers, Map as MapIcon, MapPinned, MousePointerClick, Sprout, Target, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CountUp, Reveal, useTweened } from "@/components/anim";
import { RainBarChart, YieldTrendChart } from "@/components/charts-lazy";
import { ChoroplethMap, escapeHtml } from "@/components/map";
import { Card, CategoryBadge, Loading, NoData, PageHeader, Segmented, StatTile } from "@/components/ui";
import { useData } from "@/lib/data";
import { fmt } from "@/lib/stats";
import { CATEGORIES, usePalette } from "@/lib/theme";
import type { ComponentKey, DistrictProps, DistrictsGeo, Recommendations, Summary, Timeseries } from "@/lib/types";

const ALL = "__all__";
const COMPONENT_LABELS: Record<ComponentKey, string> = {
  rain_variability: "Erratic rainfall",
  drought_frequency: "Frequent drought",
  heat_stress: "Heat stress",
  soil_degradation: "Soil degradation",
  yield_volatility: "Volatile yields",
};

function riskFor(d: DistrictProps, crop: string) {
  if (crop === ALL) return { index: d.risk_index, category: d.risk_category, driver: d.driver };
  const c = d.crops?.[crop];
  return { index: c?.index ?? null, category: c?.category ?? null, driver: c?.driver ?? null };
}

export default function RiskMapView() {
  const geo = useData<DistrictsGeo>("districts.geojson");
  const ts = useData<Timeseries>("timeseries.json");
  const recs = useData<Recommendations>("recommendations.json");
  const summary = useData<Summary>("summary.json");
  const p = usePalette();
  const [crop, setCrop] = useState(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [panelCrop, setPanelCrop] = useState<string | null>(null);

  const crops = ts.data?.crops ?? [];
  const features = useMemo(() => geo.data?.features ?? [], [geo.data]);
  const sel = features.find((f) => f.properties.district === selected)?.properties;
  const selCrops = sel ? Object.keys(sel.crops) : [];
  const shownCrop = crop !== ALL ? crop : panelCrop && selCrops.includes(panelCrop) ? panelCrop : selCrops[0];
  const selRisk = sel ? riskFor(sel, crop) : null;
  const tweenScore = useTweened(selRisk?.index ?? null);

  const table = useMemo(
    () => features.map((f) => ({ d: f.properties, ...riskFor(f.properties, crop) })).sort((a, b) => (b.index ?? -1) - (a.index ?? -1)),
    [features, crop],
  );
  const stats = useMemo(() => {
    const withData = table.filter((r) => r.index != null);
    const drivers = new Map<string, number>();
    withData.forEach((r) => r.driver && drivers.set(r.driver, (drivers.get(r.driver) ?? 0) + 1));
    const topDriver = [...drivers.entries()].sort((a, b) => b[1] - a[1])[0];
    return { severe: withData.filter((r) => r.category === "Severe").length, top: withData[0], topDriver, n: withData.length };
  }, [table]);

  if (geo.loading) return <Loading />;
  if (!geo.data) return <><PageHeader title="Risk Map" /><NoData error={geo.error} /></>;

  const fill = (d: DistrictProps) => {
    const c = riskFor(d, crop).category;
    return c ? p.risk[c] : null;
  };
  const tooltip = (d: DistrictProps) => {
    const r = riskFor(d, crop);
    return r.index == null
      ? `<strong>${escapeHtml(d.district)}</strong><br/>No data${crop !== ALL ? ` for ${escapeHtml(crop)}` : ""}`
      : `<strong style="font-size:13px">${escapeHtml(d.district)}</strong><br/><span style="font-family:var(--font-mono)">Risk score <strong>${fmt(r.index, 0)}</strong>/100 · ${escapeHtml(r.category)}</span>` +
          `<br/>Top driver: ${escapeHtml(r.driver ?? "–")}`;
  };
  const ranges = crop === ALL ? summary.data?.district_category_cutoffs : summary.data?.pair_category_cutoffs;
  const series = sel && shownCrop ? ts.data?.district?.[sel.district]?.[shownCrop] : undefined;
  const recItem = recs.data?.district_crop.find((r) => r.district === sel?.district && r.crop === shownCrop);
  const comps = sel && shownCrop ? sel.crops[shownCrop]?.components : undefined;
  const cropLabel = crop === ALL ? "all crops" : crop;

  return (
    <div>
      <PageHeader eyebrow="Climate Stress Risk Index" icon={MapIcon} title="Where climate stress hits hardest"
        lead="Each district scores 0–100 on rainfall variability, drought frequency, heat stress, soil degradation and yield volatility, weighted by how strongly each one moves yields. Hover for details; click a district to open its profile."
        meta={[`${features.length} districts`, `${crops.length} crops`, "Census 2011 boundaries", "Quartile categories"]} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Reveal delay={0} className="h-full"><StatTile icon={Flame} label="Severe districts" value={<CountUp value={stats.severe} />} note={`of ${stats.n} with data · ${cropLabel}`} /></Reveal>
        <Reveal delay={50} className="h-full"><StatTile icon={Target} label="Highest score" value={stats.top ? <><CountUp value={stats.top.index ?? 0} /><span className="text-base text-muted">/100</span></> : "–"} note={stats.top?.d.district} /></Reveal>
        <Reveal delay={100} className="h-full"><StatTile icon={Layers} label="Most common driver" value={<span className="font-sans text-xl font-semibold tracking-tight">{stats.topDriver?.[0] ?? "–"}</span>} note={stats.topDriver ? `top driver in ${stats.topDriver[1]} districts` : undefined} /></Reveal>
        <Reveal delay={150} className="h-full"><StatTile icon={Sprout} label="District-crop pairs" value={<CountUp value={recs.data?.district_crop.length ?? 0} />} note={`${crops.length} crops assessed`} /></Reveal>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="card min-w-0 p-3 sm:p-4" aria-label="Risk map">
          {/* Layer toolbar */}
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-md border border-line bg-surface-2 p-2.5">
            <Segmented id="risk-crop" label="Layer · crop" value={crop} onChange={setCrop}
              options={[{ value: ALL, label: "All crops" }, ...crops.map((c) => ({ value: c, label: c }))]} />
            <div className="flex flex-wrap items-end gap-2" aria-label="Legend">
              {CATEGORIES.map((c) => (
                <div key={c} className="w-16">
                  <span className="block h-2 rounded-sm" style={{ background: p.risk[c] }} aria-hidden="true" />
                  <p className="mt-1 text-[11px] font-semibold leading-3">{c}</p>
                  <p className="num text-[10px] leading-3 text-muted">{ranges?.[c] ? `${fmt(ranges[c][0], 0)}–${fmt(ranges[c][1], 0)}` : " "}</p>
                </div>
              ))}
              <div className="w-16">
                <span className="block h-2 rounded-sm border border-dashed" style={{ borderColor: p.muted }} aria-hidden="true" />
                <p className="mt-1 text-[11px] font-semibold leading-3">No data</p>
                <p className="text-[10px] leading-3">&nbsp;</p>
              </div>
            </div>
          </div>
          <div className="map-canvas overflow-hidden">
            <ChoroplethMap geo={geo.data} fill={fill} tooltip={tooltip} onSelect={setSelected} selected={selected}
              styleKey={`${crop}|${p.surface}`} height={540} edge={p.surface} highlight={p.ink} noDataEdge={p.muted} />
          </div>
          <p className="mt-2.5 px-1 font-mono text-[11px] leading-4 text-muted">
            {crop === ALL
              ? "Categories are quartiles of the district scores (area-weighted over crops), relative within the state."
              : "Categories are quartiles of the index across all district-crop pairs, relative within the state."}
            {" "}Projection: WGS 84 · no basemap.
          </p>
        </section>

        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {!sel ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="card flex h-full flex-col p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-[-0.015em]">Vulnerability hotspots</h2>
                    <p className="font-mono text-[11px] text-muted">Ranked by risk score · {cropLabel}</p>
                  </div>
                  <span className="tag">Top {Math.min(7, stats.n)} of {stats.n}</span>
                </div>
                <ol className="mt-4 space-y-2">
                  {table.filter((r) => r.index != null).slice(0, 7).map((r, i) => (
                    <li key={r.d.district}>
                      <button onClick={() => setSelected(r.d.district)}
                        className="group grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-3 rounded-md border border-line bg-surface-2/60 p-2.5 text-left transition-colors hover:border-brand/50 hover:bg-surface">
                        <span className="num grid h-7 w-7 place-items-center rounded border border-line bg-surface text-xs font-semibold text-ink-2">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{r.d.district}</span>
                          <span className="block truncate text-xs text-muted">{r.driver ?? "–"}</span>
                        </span>
                        <span className="text-right">
                          <span className="num block text-lg font-semibold leading-5">{fmt(r.index, 0)}</span>
                          <span className="inline-flex items-center gap-0.5 font-mono text-[10px] uppercase text-muted group-hover:text-brand-ink">
                            {r.category} <ChevronRight size={11} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="mt-auto flex items-start gap-2.5 border-t border-line pt-4 text-[13px] leading-5 text-ink-2">
                  <MousePointerClick size={16} className="mt-0.5 shrink-0 text-brand-ink" />
                  <p>Click any district on the map to see what drives its risk, its yield and rainfall history, and recommended actions.</p>
                </div>
              </motion.div>
            ) : (
              <motion.section
                key={sel.district}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="card p-4 sm:p-5"
                aria-label={`${sel.district} profile`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="micro">District profile</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{sel.district}</h2>
                    {sel.cluster && <p className="mt-0.5 font-mono text-[11px] text-muted">Profile: {sel.cluster}</p>}
                  </div>
                  <button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded border border-line text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Close profile">
                    <X size={15} />
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-line bg-surface-2/60 p-3">
                  <div>
                    <p className="micro">Risk score · {cropLabel}</p>
                    <p className="num mt-1 text-4xl font-semibold leading-10">
                      {tweenScore == null ? "–" : Math.round(tweenScore)}
                      <span className="text-base font-medium text-muted">/100</span>
                    </p>
                  </div>
                  <CategoryBadge category={selRisk?.category} color={selRisk?.category ? p.risk[selRisk.category] : undefined} />
                </div>

                {crop === ALL && selCrops.length > 1 && (
                  <div className="mt-4">
                    <Segmented id="panel-crop" label="Crop detail" value={shownCrop ?? ""} onChange={setPanelCrop}
                      options={selCrops.map((c) => ({ value: c, label: c }))} />
                  </div>
                )}

                {!shownCrop ? <p className="mt-4 text-sm text-ink-2">No crop data for this district.</p> : (
                  <div className="mt-5 space-y-5">
                    {comps && (
                      <div>
                        <h3 className="micro">What drives the risk · {shownCrop}</h3>
                        <ul className="mt-3 space-y-2">
                          {(Object.keys(COMPONENT_LABELS) as ComponentKey[]).map((k) => (
                            <li key={k} className="grid grid-cols-[8.5rem_1fr_2.75rem] items-center gap-3 text-xs">
                              <span className="text-ink-2">{COMPONENT_LABELS[k]}</span>
                              <span className="h-1.5 overflow-hidden rounded-sm bg-surface-2">
                                <span className="bar-grow block h-full rounded-sm bg-brand" style={{ width: `${Math.round(100 * (comps[k] ?? 0))}%` }} />
                              </span>
                              <span className="num text-right font-semibold">{fmt(comps[k])}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 font-mono text-[11px] text-muted">0 = least stressed pair in the state, 1 = most stressed.</p>
                      </div>
                    )}
                    {series && (
                      <>
                        <div className="border-t border-line pt-4">
                          <h3 className="micro">Yield trend · {shownCrop}</h3>
                          <YieldTrendChart years={series.year} values={series.yield} trend={series.trend} height={190} />
                        </div>
                        <div>
                          <h3 className="micro">Seasonal rainfall</h3>
                          <RainBarChart years={series.year} values={series.rain_mm} height={150} />
                        </div>
                      </>
                    )}
                    {recItem && recs.data && (
                      <div className="border-t border-line pt-4">
                        <h3 className="micro">Recommended actions</h3>
                        <ul className="mt-3 space-y-2">
                          {recItem.actions.map((a, i) => (
                            <motion.li key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.05 }}
                              className="rounded-r border border-l-2 border-line border-l-brand bg-surface-2/50 p-3 text-[13px]">
                              <p className="font-semibold">{recs.data!.actions[a.id]?.title ?? a.id}</p>
                              <p className="mt-0.5 leading-5 text-ink-2">{recs.data!.actions[a.id]?.detail}</p>
                              <p className="mt-1.5 font-mono text-[11px] text-muted">Why: {a.why}</p>
                            </motion.li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Reveal className="mt-6">
        <Card title="District ranking" subtitle={`Climate Stress Risk Index · ${cropLabel}`} icon={MapPinned}>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[42rem] text-[13px]">
              <caption className="sr-only">Risk score by district{crop !== ALL ? ` for ${crop}` : ""}</caption>
              <thead>
                <tr className="border-y border-line bg-surface-2 text-left">
                  <th scope="col" className="micro h-9 pl-4 pr-3 sm:pl-5">#</th>
                  <th scope="col" className="micro h-9 pr-3">District</th>
                  <th scope="col" className="micro h-9 w-[32%] pr-3">Score</th>
                  <th scope="col" className="micro h-9 pr-3">Category</th>
                  <th scope="col" className="micro h-9 pr-3">Top driver</th>
                  <th scope="col" className="micro h-9 pr-4 sm:pr-5">Profile</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.d.district} onClick={() => setSelected(r.d.district)}
                    className={`h-10 cursor-pointer border-b border-line transition-colors hover:bg-surface-2/70 ${selected === r.d.district ? "bg-brand-soft" : ""}`}>
                    <td className="num pl-4 pr-3 text-muted sm:pl-5">{r.index == null ? "–" : String(i + 1).padStart(2, "0")}</td>
                    <td className="pr-3">
                      <button className="text-left font-semibold hover:text-brand-ink" onClick={(e) => { e.stopPropagation(); setSelected(r.d.district); }}>
                        {r.d.district}
                      </button>
                    </td>
                    <td className="pr-3">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-2">
                          <span className="bar-grow block h-full rounded-sm" style={{ width: `${r.index ?? 0}%`, background: r.category ? p.risk[r.category] : "transparent" }} />
                        </span>
                        <span className="num w-8 text-right font-semibold">{fmt(r.index, 0)}</span>
                      </div>
                    </td>
                    <td className="pr-3"><CategoryBadge category={r.category} color={r.category ? p.risk[r.category] : undefined} /></td>
                    <td className="pr-3 text-ink-2">{r.driver ?? "–"}</td>
                    <td className="pr-4 text-ink-2 sm:pr-5">{r.d.cluster ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
