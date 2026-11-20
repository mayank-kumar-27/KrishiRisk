"use client";

import { AnimatePresence, motion } from "motion/react";
import { Flame, Layers, Map as MapIcon, MapPinned, MousePointerClick, Sprout, Target, X } from "lucide-react";
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
      : `<strong style="font-size:13px">${escapeHtml(d.district)}</strong><br/>Risk score <strong>${fmt(r.index, 0)}</strong>/100 · ${escapeHtml(r.category)}` +
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
        lead="Each district scores 0–100 on rainfall variability, drought frequency, heat stress, soil degradation and yield volatility — weighted by how strongly each one moves yields. Hover for details; click a district to open its profile." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Reveal delay={0}><StatTile icon={Flame} label="Severe districts" value={<CountUp value={stats.severe} />} note={`of ${stats.n} with data · ${cropLabel}`} /></Reveal>
        <Reveal delay={70}><StatTile icon={Target} label="Highest score" value={stats.top ? <><CountUp value={stats.top.index ?? 0} /><span className="text-xl text-ink-2">/100</span></> : "–"} note={stats.top?.d.district} /></Reveal>
        <Reveal delay={140}><StatTile icon={Layers} label="Most common driver" value={<span className="text-2xl sm:text-[1.6rem]">{stats.topDriver?.[0] ?? "–"}</span>} note={stats.topDriver ? `top driver in ${stats.topDriver[1]} districts` : undefined} /></Reveal>
        <Reveal delay={210}><StatTile icon={Sprout} label="District-crop pairs" value={<CountUp value={recs.data?.district_crop.length ?? 0} />} note={`${crops.length} crops assessed`} /></Reveal>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <Segmented id="risk-crop" label="Crop" value={crop} onChange={setCrop}
          options={[{ value: ALL, label: "All crops" }, ...crops.map((c) => ({ value: c, label: c }))]} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Legend">
          {CATEGORIES.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded" style={{ background: p.risk[c] }} aria-hidden="true" />
              <span className="font-medium">{c}</span>
              {ranges?.[c] && <span className="text-xs text-muted">{fmt(ranges[c][0], 0)}–{fmt(ranges[c][1], 0)}</span>}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded border border-dashed" style={{ borderColor: p.muted }} aria-hidden="true" />
            No data
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden !p-3 sm:!p-4">
          <ChoroplethMap geo={geo.data} fill={fill} tooltip={tooltip} onSelect={setSelected} selected={selected}
            styleKey={`${crop}|${p.surface}`} height={540} edge={p.surface} highlight={p.ink} noDataEdge={p.muted} />
          <p className="px-2 pb-1 text-xs text-muted">
            {crop === ALL
              ? "Categories are quartiles of the district scores (area-weighted over crops) — relative within the state."
              : "Categories are quartiles of the index across all district-crop pairs — relative within the state."}
          </p>
        </Card>

        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {!sel ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="card flex h-full flex-col items-center justify-center p-8 text-center">
                <span className="icon-chip h-14 w-14"><MousePointerClick size={26} /></span>
                <p className="font-display mt-4 text-lg font-bold">Pick a district</p>
                <p className="mt-1 max-w-xs text-sm text-ink-2">
                  Click any district on the map to see what drives its risk, its yield and rainfall history, and recommended actions.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {table.filter((r) => r.index != null).slice(0, 3).map((r) => (
                    <button key={r.d.district} onClick={() => setSelected(r.d.district)}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:border-ink-2/40">
                      {r.d.district} · {fmt(r.index, 0)}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.section
                key={sel.district}
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="card p-5 sm:p-6"
                aria-label={`${sel.district} profile`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">District profile</p>
                    <h2 className="font-display mt-1 text-2xl font-extrabold">{sel.district}</h2>
                    {sel.cluster && <p className="mt-0.5 text-sm text-ink-2">Profile: {sel.cluster}</p>}
                  </div>
                  <button onClick={() => setSelected(null)} className="rounded-full border border-line p-1.5 text-ink-2 hover:text-ink" aria-label="Close profile">
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-4 flex items-end gap-4">
                  <p className="font-display text-5xl font-extrabold tabular-nums">
                    {tweenScore == null ? "–" : Math.round(tweenScore)}
                    <span className="text-xl font-bold text-ink-2">/100</span>
                  </p>
                  <div className="pb-1.5">
                    <CategoryBadge category={selRisk?.category} color={selRisk?.category ? p.risk[selRisk.category] : undefined} />
                    <p className="mt-1 text-xs text-muted">{cropLabel}</p>
                  </div>
                </div>

                {crop === ALL && selCrops.length > 1 && (
                  <div className="mt-5">
                    <Segmented id="panel-crop" label="Crop detail" value={shownCrop ?? ""} onChange={setPanelCrop}
                      options={selCrops.map((c) => ({ value: c, label: c }))} />
                  </div>
                )}

                {!shownCrop ? <p className="mt-4 text-sm text-ink-2">No crop data for this district.</p> : (
                  <div className="mt-5 space-y-6">
                    {comps && (
                      <div>
                        <h3 className="text-sm font-semibold">What drives the risk · {shownCrop}</h3>
                        <ul className="mt-3 space-y-2.5">
                          {(Object.keys(COMPONENT_LABELS) as ComponentKey[]).map((k) => (
                            <li key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-xs">
                              <span className="text-ink-2">{COMPONENT_LABELS[k]}</span>
                              <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                                <span className="bar-grow block h-full rounded-full"
                                  style={{ width: `${Math.round(100 * (comps[k] ?? 0))}%`, background: "linear-gradient(90deg, var(--brand), var(--accent))" }} />
                              </span>
                              <span className="text-right font-semibold tabular-nums">{fmt(comps[k])}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs text-muted">0 = least stressed pair in the state, 1 = most stressed.</p>
                      </div>
                    )}
                    {series && (
                      <>
                        <div>
                          <h3 className="text-sm font-semibold">Yield trend · {shownCrop}</h3>
                          <YieldTrendChart years={series.year} values={series.yield} trend={series.trend} height={190} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold">Seasonal rainfall</h3>
                          <RainBarChart years={series.year} values={series.rain_mm} height={150} />
                        </div>
                      </>
                    )}
                    {recItem && recs.data && (
                      <div>
                        <h3 className="text-sm font-semibold">Recommended actions</h3>
                        <ul className="mt-3 space-y-2">
                          {recItem.actions.map((a, i) => (
                            <motion.li key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }}
                              className="rounded-xl border border-line bg-surface-2/50 p-3 text-sm">
                              <p className="font-semibold">{recs.data!.actions[a.id]?.title ?? a.id}</p>
                              <p className="mt-0.5 text-ink-2">{recs.data!.actions[a.id]?.detail}</p>
                              <p className="mt-1 text-xs text-muted">Why: {a.why}</p>
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

      <Reveal className="mt-10">
        <Card title="District ranking" subtitle={`Climate Stress Risk Index · ${cropLabel}`} icon={MapPinned}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Risk score by district{crop !== ALL ? ` for ${crop}` : ""}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="py-2.5 pr-3 font-semibold">#</th>
                  <th scope="col" className="py-2.5 pr-3 font-semibold">District</th>
                  <th scope="col" className="w-[34%] py-2.5 pr-3 font-semibold">Score</th>
                  <th scope="col" className="py-2.5 pr-3 font-semibold">Category</th>
                  <th scope="col" className="py-2.5 pr-3 font-semibold">Top driver</th>
                  <th scope="col" className="py-2.5 font-semibold">Profile</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.d.district} onClick={() => setSelected(r.d.district)}
                    className={`cursor-pointer border-b border-line/60 transition-colors hover:bg-surface-2/60 ${selected === r.d.district ? "bg-brand-soft/40" : ""}`}>
                    <td className="py-2.5 pr-3 tabular-nums text-muted">{r.index == null ? "–" : i + 1}</td>
                    <td className="py-2.5 pr-3">
                      <button className="text-left font-semibold hover:text-accent-ink" onClick={(e) => { e.stopPropagation(); setSelected(r.d.district); }}>
                        {r.d.district}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <span className="bar-grow block h-full rounded-full" style={{ width: `${r.index ?? 0}%`, background: r.category ? p.risk[r.category] : "transparent" }} />
                        </span>
                        <span className="w-8 text-right font-semibold tabular-nums">{fmt(r.index, 0)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3"><CategoryBadge category={r.category} color={r.category ? p.risk[r.category] : undefined} /></td>
                    <td className="py-2.5 pr-3 text-ink-2">{r.driver ?? "–"}</td>
                    <td className="py-2.5 text-ink-2">{r.d.cluster ?? "–"}</td>
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
