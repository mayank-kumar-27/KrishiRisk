"use client";

import { motion } from "motion/react";
import { CloudRain, RotateCcw, SlidersHorizontal, Thermometer } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { Reveal, useTweened } from "@/components/anim";
import { divergingColor } from "@/components/chart-utils";
import StateMap from "@/components/StateMap";
import { Callout, Card, Loading, NoData, PageHeader, Segmented, Select } from "@/components/ui";
import { useData } from "@/lib/data";
import { fmt, signed } from "@/lib/stats";
import { usePalette } from "@/lib/theme";
import type { DistrictsGeo, Scenarios } from "@/lib/types";

const PRESETS = [
  { label: "Today's climate", rain: 0, temp: 0 },
  { label: "Mild drought", rain: -15, temp: 0.5 },
  { label: "Severe drought", rain: -35, temp: 1.5 },
  { label: "Heatwave year", rain: 0, temp: 2.5 },
  { label: "Hot & dry", rain: -40, temp: 3 },
  { label: "Wet year", rain: 20, temp: 0 },
];

function Slider({ id, label, icon: I, value, min, max, step, onChange, format, track, thumb }: {
  id: string; label: string; icon: typeof CloudRain; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string; track: string; thumb: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="flex items-center gap-2 text-[13px] font-semibold">
          <I size={15} className="text-brand-ink" /> {label}
        </label>
        <output htmlFor={id} className="num rounded border border-line bg-surface-2 px-2 py-0.5 text-lg font-semibold">{format(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))} className="range mt-3"
        style={{ "--track": track, "--thumb": thumb } as CSSProperties} />
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted"><span>{format(min)}</span><span>{format(max)}</span></div>
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
  const maxAbs = useMemo(() => {
    let m = 1;
    for (const d of districts) for (const row of sc.data?.pairs[`${d}|${crop}`]?.pct ?? []) for (const v of row) if (v != null) m = Math.max(m, Math.abs(v));
    return m;
  }, [sc.data, districts, crop]);

  const s = sc.data;
  const ri = s ? s.rain_change_pct.indexOf(rain) : -1;
  const ti = s ? s.temp_change_c.indexOf(temp) : -1;
  const pctOf = (d: string) => s?.pairs[`${d}|${crop}`]?.pct?.[ri]?.[ti] ?? null;
  const pct = district ? pctOf(district) : null;
  const base = district ? s?.pairs[`${district}|${crop}`]?.baseline_yield ?? null : null;
  const predicted = base != null && pct != null ? base * (1 + pct / 100) : null;
  const statePct = s?.state[crop]?.pct?.[ri]?.[ti] ?? null;
  const tPred = useTweened(predicted);
  const tPct = useTweened(pct);
  const tState = useTweened(statePct);

  if (sc.loading) return <Loading />;
  if (!s || !crop) return <><PageHeader title="What-If Simulator" /><NoData error={sc.error} /></>;

  const ranked = districts.map((d) => ({ d, v: pctOf(d) })).filter((x): x is { d: string; v: number } => x.v != null).sort((a, b) => a.v - b.v);
  const rMin = s.rain_change_pct[0];
  const rMax = s.rain_change_pct[s.rain_change_pct.length - 1];
  const tMax = s.temp_change_c[s.temp_change_c.length - 1];
  const pos = (v: number) => (100 * (v - rMin)) / (rMax - rMin);
  const zero = pos(0);
  const rainTrack = rain === 0 ? "var(--line)"
    : `linear-gradient(to right, var(--line) 0 ${Math.min(zero, pos(rain))}%, ${rain < 0 ? p.red : p.rain} ${Math.min(zero, pos(rain))}% ${Math.max(zero, pos(rain))}%, var(--line) ${Math.max(zero, pos(rain))}% 100%)`;
  const tPos = (100 * temp) / tMax;
  const tempTrack = `linear-gradient(to right, #f59e0b 0%, ${p.red} ${tPos}%, var(--line) ${tPos}% 100%)`;
  const deltaColor = pct == null || Math.abs(pct) < 0.05 ? "var(--muted)" : pct < 0 ? p.red : p.gain;
  const activePreset = PRESETS.find((x) => x.rain === rain && x.temp === temp)?.label;

  return (
    <div>
      <PageHeader eyebrow="What-If Simulator" icon={SlidersHorizontal} title="What if the monsoon fails?"
        lead={`Dial seasonal rainfall and temperature and watch predicted yields respond. Each scenario re-scales the observed daily climate of the last ten years, recomputes every climate feature (dry spells, SPI, heat days, growing degree days) and re-runs the ${s.model} model.`}
        meta={[`Model: ${s.model}`, `${s.rain_change_pct.length} × ${s.temp_change_c.length} scenario grid`, "Last ten seasons re-scaled", s.reliable ? "Beats trend baseline" : "Indicative only"]} />
      {!s.reliable && (
        <div className="mb-5">
          <Callout>The yield model did not beat a simple trend forecast in cross-validation, so these responses are weak and indicative only.</Callout>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
        <Card title="Scenario" icon={SlidersHorizontal} action={
          <button onClick={() => { setRain(0); setTemp(0); }} className="btn btn-ghost !h-8 !px-2.5 !text-xs">
            <RotateCcw size={13} /> Reset
          </button>
        }>
          <div className="space-y-6">
            <div className="flex flex-wrap gap-4">
              <Segmented id="sim-crop" label="Crop" value={crop} onChange={setCrop} options={crops.map((c) => ({ value: c, label: c }))} />
              <Select label="District" value={district ?? ""} onChange={setDistrict} options={districts.map((d) => ({ value: d, label: d }))} />
            </div>
            <div>
              <p className="micro">Quick scenarios</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((x) => (
                  <button key={x.label} onClick={() => { setRain(x.rain); setTemp(x.temp); }}
                    aria-pressed={activePreset === x.label}
                    className={`h-7 rounded border px-2.5 font-mono text-[11px] font-medium transition-colors ${
                      activePreset === x.label ? "border-brand-solid bg-brand-solid text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2 hover:text-ink"
                    }`}>
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
            <Slider id="rain" label="Rainfall change" icon={CloudRain} value={rain} min={rMin} max={rMax}
              step={s.rain_change_pct[1] - s.rain_change_pct[0]} onChange={setRain} format={(v) => `${signed(v, 0)}%`}
              track={rainTrack} thumb={rain < 0 ? p.red : rain > 0 ? p.rain : p.muted} />
            <Slider id="temp" label="Temperature change" icon={Thermometer} value={temp} min={s.temp_change_c[0]} max={tMax}
              step={s.temp_change_c[1] - s.temp_change_c[0]} onChange={setTemp} format={(v) => `+${v.toFixed(1)} °C`}
              track={tempTrack} thumb={temp > 0 ? p.red : p.muted} />
            <div className="rounded-md border border-line bg-surface-2/60 p-3.5">
              <p className="micro">How a scenario is computed</p>
              <ol className="mt-3 space-y-2 text-[13px] leading-5 text-ink-2">
                {[
                  "Every day's rainfall in the last ten seasons is scaled by the rainfall change.",
                  "Daily maximum and minimum temperatures are shifted by the temperature change.",
                  "Dry spells, SPI drought index, monsoon onset, heat days and degree days are recomputed.",
                  `The ${s.model} model predicts each season's yield against the district trend.`,
                ].map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 pt-px font-mono text-[11px] font-semibold text-brand-ink">{String(i + 1).padStart(2, "0")}</span>
                    {t}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Card>

        <div className="grid min-w-0 gap-4">
          <section className="card relative overflow-hidden p-4 sm:p-5" aria-live="polite">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 transition-colors" style={{ background: deltaColor }} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="micro">Projected yield outcome</p>
              <span className="tag">{crop} · {district}</span>
            </div>
            <div className="relative mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
              <p className="num text-5xl font-semibold leading-[52px] sm:text-6xl sm:leading-[64px]">
                {tPred == null ? "–" : tPred.toFixed(2)}
                <span className="ml-2 font-sans text-base font-medium text-muted">t/ha</span>
              </p>
              <p className="num mb-2 rounded px-2 py-1 text-base font-semibold text-white transition-colors" style={{ background: deltaColor }}>
                {tPct == null ? "–" : `${signed(tPct)}%`}
              </p>
            </div>
            <div className="relative mt-5">
              <div className="relative h-2 overflow-hidden rounded-sm bg-surface-2">
                <span className="absolute inset-y-0 left-1/2 w-px bg-ink-2/40" aria-hidden="true" />
                {tPct != null && (
                  <span className="absolute inset-y-0 rounded-sm"
                    style={{
                      background: deltaColor,
                      left: tPct < 0 ? `${50 - (50 * Math.min(Math.abs(tPct), maxAbs)) / maxAbs}%` : "50%",
                      width: `${(50 * Math.min(Math.abs(tPct), maxAbs)) / maxAbs}%`,
                    }} />
                )}
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted">
                <span>−{fmt(maxAbs, 1)}%</span><span>no change</span><span>+{fmt(maxAbs, 1)}%</span>
              </div>
            </div>
            <dl className="relative mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line text-sm">
              <div className="bg-surface-2/60 p-3"><dt className="micro">Unchanged climate</dt><dd className="num mt-1 text-lg font-semibold">{fmt(base)} <span className="font-sans text-xs font-medium text-muted">t/ha</span></dd></div>
              <div className="bg-surface-2/60 p-3"><dt className="micro">State average change</dt><dd className="num mt-1 text-lg font-semibold">{tState == null ? "–" : `${signed(tState)}%`}</dd></div>
            </dl>
          </section>

          <Card title={`Predicted ${crop} yield change by district`} subtitle="Click a district to select it">
            {geo.data ? (
              <>
                <div className="map-canvas p-2 sm:p-4">
                <StateMap
                  geo={geo.data}
                  ariaLabel={`Predicted ${crop} yield change by district`}
                  fill={(d) => { const v = pctOf(d.district); return v == null ? null : divergingColor(p, v, maxAbs); }}
                  selected={district}
                  onSelect={setDistrict}
                  tooltip={(d) => {
                    const v = pctOf(d.district);
                    return (<><strong className="text-[13px]">{d.district}</strong><br /><span className="font-mono">{v == null ? `No ${crop} data` : `${signed(v)}% predicted ${crop.toLowerCase()} yield`}</span></>);
                  }}
                />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs" aria-label="Legend">
                  <span className="num text-ink-2">−{fmt(maxAbs, 1)}%</span>
                  <span className="inline-block h-2 w-44 rounded-sm" aria-hidden="true"
                    style={{ background: `linear-gradient(90deg, ${p.diverging[0]}, ${p.neutral}, ${p.diverging[5]})` }} />
                  <span className="num text-ink-2">+{fmt(maxAbs, 1)}%</span>
                  <span className="font-mono text-[11px] text-muted">scale fitted to the largest change for {crop.toLowerCase()}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-5 rounded-sm border border-dashed" style={{ borderColor: p.muted }} aria-hidden="true" />
                    No data
                  </span>
                </div>
              </>
            ) : <NoData error={geo.error} />}
          </Card>
        </div>
      </div>

      <Reveal className="mt-4">
        <Card title="Hardest hit → least affected" subtitle={`${crop} · rainfall ${signed(rain, 0)}% · temperature +${temp.toFixed(1)} °C`}>
          {rain === 0 && temp === 0 && (
            <p className="mb-3 rounded-md border border-line bg-surface-2/70 px-3 py-2 text-[13px] text-ink-2">
              This is today&apos;s climate, so every change is zero. Pick a quick scenario or move a slider; districts re-rank as you go.
            </p>
          )}
          <ul className="space-y-0.5">
            {ranked.map((r) => (
              <motion.li key={r.d} layout transition={{ type: "spring", stiffness: 380, damping: 34 }}>
                <button onClick={() => setDistrict(r.d)}
                  className={`grid w-full grid-cols-[7.5rem_1fr_4.25rem] items-center gap-3 rounded px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface-2/70 sm:grid-cols-[9rem_1fr_4.5rem] ${r.d === district ? "bg-brand-soft shadow-[inset_2px_0_0_var(--brand)]" : ""}`}>
                  <span className="truncate font-semibold">{r.d}</span>
                  <span className="relative h-1.5 rounded-sm bg-surface-2">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-ink-2/30" aria-hidden="true" />
                    <span className="absolute inset-y-0 rounded-sm transition-all duration-500"
                      style={{
                        background: divergingColor(p, r.v, maxAbs),
                        left: r.v < 0 ? `${50 - (50 * Math.min(Math.abs(r.v), maxAbs)) / maxAbs}%` : "50%",
                        width: `${Math.max(1, (50 * Math.min(Math.abs(r.v), maxAbs)) / maxAbs)}%`,
                      }} />
                  </span>
                  <span className="num text-right font-semibold">{signed(r.v)}%</span>
                </button>
              </motion.li>
            ))}
          </ul>
          <p className="mt-4 font-mono text-[11px] leading-4 text-muted">
            {s.model === "RandomForest" || s.model === "XGBoost"
              ? "Tree-based models cannot extrapolate beyond the climate they were trained on, so extreme scenarios are likely to understate impacts."
              : "The linear model extends straight-line effects beyond the observed climate, so read extreme scenarios with caution."}{" "}
            Changes are relative to the same ten years with unchanged climate.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}
