"use client";

import { useMemo, useState } from "react";
import { ChoroplethMap, escapeHtml } from "@/components/map";
import { Card, Loading, NoData, PageHeader, Select, Warning } from "@/components/ui";
import { useData } from "@/lib/data";
import { fmt, signed } from "@/lib/stats";
import { CHANGE_BINS, changeColor, usePalette } from "@/lib/theme";
import type { DistrictProps, DistrictsGeo, Scenarios } from "@/lib/types";

function Slider({ id, label, value, min, max, step, onChange, format }: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <output htmlFor={id} className="text-lg font-semibold tabular-nums">{format(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full" aria-valuetext={format(value)} />
      <div className="flex justify-between text-xs text-muted"><span>{format(min)}</span><span>{format(max)}</span></div>
    </div>
  );
}

export default function SimulatorView() {
  const sc = useData<Scenarios>("scenarios.json");
  const geo = useData<DistrictsGeo>("districts.geojson");
  const p = usePalette();
  const [rain, setRain] = useState(0);
  const [temp, setTemp] = useState(0);
  const [cropSel, setCrop] = useState<string | null>(null);
  const [districtSel, setDistrict] = useState<string | null>(null);

  const keys = useMemo(() => Object.keys(sc.data?.pairs ?? {}).map((k) => k.split("|") as [string, string]), [sc.data]);
  const crops = useMemo(() => Array.from(new Set(keys.map((k) => k[1]))).sort(), [keys]);
  const crop = cropSel && crops.includes(cropSel) ? cropSel : crops[0];
  const districts = useMemo(() => keys.filter((k) => k[1] === crop).map((k) => k[0]).sort(), [keys, crop]);
  const district = districtSel && districts.includes(districtSel) ? districtSel : districts[0];

  if (sc.loading) return <Loading />;
  if (!sc.data || !crop) return <><PageHeader title="What-If Simulator" /><NoData error={sc.error} /></>;

  const s = sc.data;
  const ri = s.rain_change_pct.indexOf(rain);
  const ti = s.temp_change_c.indexOf(temp);
  const pctOf = (d: string) => s.pairs[`${d}|${crop}`]?.pct?.[ri]?.[ti] ?? null;
  const pair = s.pairs[`${district}|${crop}`];
  const pct = pctOf(district);
  const base = pair?.baseline_yield ?? null;
  const predicted = base != null && pct != null ? base * (1 + pct / 100) : null;
  const statePct = s.state[crop]?.pct?.[ri]?.[ti] ?? null;
  const ranked = districts.map((d) => ({ d, v: pctOf(d) })).filter((x) => x.v != null).sort((a, b) => (a.v as number) - (b.v as number));

  const fill = (d: DistrictProps) => (pctOf(d.district) == null ? null : changeColor(p, pctOf(d.district)));
  const tooltip = (d: DistrictProps) => {
    const v = pctOf(d.district);
    return `<strong>${escapeHtml(d.district)}</strong><br/>${v == null ? `No ${escapeHtml(crop)} data` : `${signed(v)}% predicted ${escapeHtml(crop)} yield`}`;
  };

  return (
    <div>
      <PageHeader title="What-If Simulator"
        lead={`Change seasonal rainfall and temperature and see the ${s.model} model's predicted yield. Each scenario re-scales the observed daily climate of the last ten years and recomputes every climate feature (dry spells, SPI, heat days, growing degree days).`} />
      {!s.reliable && (
        <div className="mb-4">
          <Warning>
            The yield model did not beat a simple trend forecast in cross-validation, so these responses are weak and
            indicative only.
          </Warning>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Scenario">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-4">
              <Select label="Crop" value={crop} onChange={setCrop} options={crops.map((c) => ({ value: c, label: c }))} />
              <Select label="District" value={district} onChange={setDistrict} options={districts.map((d) => ({ value: d, label: d }))} />
            </div>
            <Slider id="rain" label="Rainfall change" value={rain} min={s.rain_change_pct[0]} max={s.rain_change_pct[s.rain_change_pct.length - 1]}
              step={s.rain_change_pct[1] - s.rain_change_pct[0]} onChange={setRain} format={(v) => `${signed(v, 0)}%`} />
            <Slider id="temp" label="Temperature change" value={temp} min={s.temp_change_c[0]} max={s.temp_change_c[s.temp_change_c.length - 1]}
              step={s.temp_change_c[1] - s.temp_change_c[0]} onChange={setTemp} format={(v) => `+${v.toFixed(1)} °C`} />
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <p className="text-xs text-ink-2">Predicted {crop} yield, {district}</p>
                <p className="text-2xl font-semibold tabular-nums">{fmt(predicted)} <span className="text-sm font-normal text-ink-2">t/ha</span></p>
                <p className="text-xs text-muted">Unchanged climate: {fmt(base)} t/ha</p>
              </div>
              <div>
                <p className="text-xs text-ink-2">Change vs unchanged climate</p>
                <p className="text-2xl font-semibold tabular-nums">{signed(pct)}%</p>
                <p className="text-xs text-muted">State average: {signed(statePct)}%</p>
              </div>
            </div>
            {ranked.length > 1 && ranked[0].v !== ranked[ranked.length - 1].v && (
              <p className="text-sm text-ink-2">
                Hardest hit under this scenario: <strong className="text-ink">{ranked[0].d}</strong> ({signed(ranked[0].v)}%);
                least affected: <strong className="text-ink">{ranked[ranked.length - 1].d}</strong> ({signed(ranked[ranked.length - 1].v)}%).
              </p>
            )}
          </div>
        </Card>

        <Card title={`Predicted ${crop} yield change by district`}>
          {geo.data ? (
            <>
              <ChoroplethMap geo={geo.data} fill={fill} tooltip={tooltip} onSelect={setDistrict} selected={district}
                styleKey={`${crop}|${rain}|${temp}|${p.surface}`} height={420} edge={p.surface} highlight={p.ink} noDataEdge={p.muted} />
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" aria-label="Legend">
                {CHANGE_BINS.map((b, i) => (
                  <span key={b.label} className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 w-5 rounded-sm" style={{ background: p.diverging[i] }} aria-hidden="true" />
                    {b.label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-5 rounded-sm border border-dashed" style={{ borderColor: p.muted }} aria-hidden="true" />
                  No data
                </span>
              </div>
            </>
          ) : <NoData error={geo.error} />}
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">
        {s.model === "RandomForest" || s.model === "XGBoost"
          ? "Tree-based models cannot extrapolate beyond the climate they were trained on, so extreme scenarios are likely to understate impacts."
          : "The linear model extends straight-line effects beyond the observed climate, so read extreme scenarios with caution."}{" "}
        Changes are relative to the same ten years with unchanged climate.
      </p>
    </div>
  );
}
