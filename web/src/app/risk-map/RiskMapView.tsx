"use client";

import { useMemo, useState } from "react";
import { RainBarChart, YieldTrendChart } from "@/components/charts";
import { ChoroplethMap, escapeHtml } from "@/components/map";
import { Card, CategoryBadge, Loading, NoData, PageHeader, Select } from "@/components/ui";
import { useData } from "@/lib/data";
import { fmt } from "@/lib/stats";
import { CATEGORIES, usePalette } from "@/lib/theme";
import type { Category, ComponentKey, DistrictProps, DistrictsGeo, Recommendations, Summary, Timeseries } from "@/lib/types";

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

  const table = useMemo(
    () =>
      features
        .map((f) => ({ d: f.properties, ...riskFor(f.properties, crop) }))
        .sort((a, b) => (b.index ?? -1) - (a.index ?? -1)),
    [features, crop],
  );

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
      : `<strong>${escapeHtml(d.district)}</strong><br/>Risk score <strong>${fmt(r.index, 0)}</strong> / 100 · ${escapeHtml(r.category)}` +
          `<br/>Top driver: ${escapeHtml(r.driver ?? "–")}`;
  };
  // District (all-crop) scores and single-crop scores are classified with their own quartiles
  const ranges = crop === ALL ? summary.data?.district_category_cutoffs : summary.data?.pair_category_cutoffs;
  const series = sel && shownCrop ? ts.data?.district?.[sel.district]?.[shownCrop] : undefined;
  const recItem = recs.data?.district_crop.find((r) => r.district === sel?.district && r.crop === shownCrop);
  const comps = sel && shownCrop ? sel.crops[shownCrop]?.components : undefined;

  return (
    <div>
      <PageHeader
        title="Climate Stress Risk Map"
        lead="Climate Stress Risk Index (0–100) per district: rainfall variability, drought frequency, heat stress, soil degradation and yield volatility, weighted by how strongly each moves yields. Hover for details; click a district to open its profile."
      />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Select label="Crop" value={crop} onChange={(v) => setCrop(v)}
          options={[{ value: ALL, label: "All crops (area-weighted)" }, ...crops.map((c) => ({ value: c, label: c }))]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <ChoroplethMap geo={geo.data} fill={fill} tooltip={tooltip} onSelect={setSelected} selected={selected}
            styleKey={`${crop}|${p.surface}`} edge={p.surface} highlight={p.ink} noDataEdge={p.muted} />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Legend">
            <span className="text-xs font-medium text-ink-2">Risk category</span>
            {CATEGORIES.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-5 rounded-sm" style={{ background: p.risk[c] }} aria-hidden="true" />
                {c}
                {ranges?.[c] && <span className="text-xs text-muted">{fmt(ranges[c][0], 0)}–{fmt(ranges[c][1], 0)}</span>}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm border border-dashed" style={{ borderColor: p.muted }} aria-hidden="true" />
              No data
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {crop === ALL
              ? "Categories are quartiles of the district scores (area-weighted over crops), so they are relative within the state."
              : "Categories are quartiles of the index across all district-crop pairs, so they are relative within the state."}
          </p>
        </Card>

        <Card title={sel ? sel.district : "District profile"}
          action={sel && <button onClick={() => setSelected(null)} className="text-sm text-ink-2 hover:text-ink" aria-label="Close profile">✕</button>}>
          {!sel ? (
            <p className="text-sm text-ink-2">Select a district on the map or in the table below.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <CategoryBadge category={riskFor(sel, crop).category} color={riskFor(sel, crop).category ? p.risk[riskFor(sel, crop).category as Category] : undefined} />
                <span>Score <strong>{fmt(riskFor(sel, crop).index, 0)}</strong>/100</span>
                {sel.cluster && <span className="text-ink-2">Profile: {sel.cluster}</span>}
              </div>
              {crop === ALL && selCrops.length > 1 && (
                <div role="tablist" aria-label="Crop" className="flex flex-wrap gap-1">
                  {selCrops.map((c) => (
                    <button key={c} role="tab" aria-selected={c === shownCrop} onClick={() => setPanelCrop(c)}
                      className={`rounded-md px-2.5 py-1 text-sm ${c === shownCrop ? "bg-accent/10 font-medium text-accent-ink" : "text-ink-2 hover:bg-line/50"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
              {!shownCrop ? <p className="text-sm text-ink-2">No crop data for this district.</p> : (
                <>
                  {comps && (
                    <div>
                      <h3 className="mb-1 text-sm font-medium">What drives the risk ({shownCrop})</h3>
                      <ul className="space-y-1">
                        {(Object.keys(COMPONENT_LABELS) as ComponentKey[]).map((k) => (
                          <li key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                            <span className="text-ink-2">{COMPONENT_LABELS[k]}</span>
                            <span className="h-2 rounded bg-line">
                              <span className="block h-2 rounded bg-accent" style={{ width: `${Math.round(100 * (comps[k] ?? 0))}%` }} />
                            </span>
                            <span className="text-right tabular-nums">{fmt(comps[k])}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-muted">0 = least stressed pair in the state, 1 = most stressed.</p>
                    </div>
                  )}
                  {series && (
                    <>
                      <div>
                        <h3 className="text-sm font-medium">Yield trend — {shownCrop}</h3>
                        <YieldTrendChart years={series.year} values={series.yield} trend={series.trend} height={200} />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium">Seasonal rainfall</h3>
                        <RainBarChart years={series.year} values={series.rain_mm} height={160} />
                      </div>
                    </>
                  )}
                  {recItem && recs.data && (
                    <div>
                      <h3 className="mb-1 text-sm font-medium">Recommended actions</h3>
                      <ul className="space-y-2">
                        {recItem.actions.map((a) => (
                          <li key={a.id} className="rounded-lg border border-line p-2.5 text-sm">
                            <p className="font-medium">{recs.data!.actions[a.id]?.title ?? a.id}</p>
                            <p className="text-ink-2">{recs.data!.actions[a.id]?.detail}</p>
                            <p className="mt-1 text-xs text-muted">Why: {a.why}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card title="All districts" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Risk score by district{crop !== ALL ? ` for ${crop}` : ""}</caption>
            <thead>
              <tr className="border-b border-line text-left text-ink-2">
                <th scope="col" className="py-2 pr-3 font-medium">District</th>
                <th scope="col" className="py-2 pr-3 font-medium">Score</th>
                <th scope="col" className="py-2 pr-3 font-medium">Category</th>
                <th scope="col" className="py-2 pr-3 font-medium">Top driver</th>
                <th scope="col" className="py-2 font-medium">Profile</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.d.district} className={`border-b border-line/60 ${selected === r.d.district ? "bg-accent/5" : ""}`}>
                  <td className="py-1.5 pr-3">
                    <button className="text-left font-medium text-accent-ink hover:underline" onClick={() => setSelected(r.d.district)}>
                      {r.d.district}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{fmt(r.index, 0)}</td>
                  <td className="py-1.5 pr-3"><CategoryBadge category={r.category} color={r.category ? p.risk[r.category] : undefined} /></td>
                  <td className="py-1.5 pr-3 text-ink-2">{r.driver ?? "–"}</td>
                  <td className="py-1.5 text-ink-2">{r.d.cluster ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
