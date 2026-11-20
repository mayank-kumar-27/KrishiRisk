"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmt, linreg, quantile } from "@/lib/stats";
import { usePalette, type Palette } from "@/lib/theme";
import { usePrefersReducedMotion } from "./anim";
import { RAIN_CLASSES, divergingColor, rainClassColor, type RainClass } from "./chart-utils";

function axisProps(p: Palette) {
  return {
    stroke: p.axis,
    tick: { fill: p.ink2, fontSize: 12 },
    tickLine: false,
  };
}

function tooltipProps(p: Palette) {
  return {
    contentStyle: { background: p.surface, border: `1px solid ${p.grid}`, borderRadius: 8, fontSize: 12, color: p.ink },
    labelStyle: { color: p.ink, fontWeight: 600 },
    itemStyle: { color: p.ink },
  };
}

// ---------------------------------------------------------------------------------------------
export function YieldTrendChart({ years, values, smooth, trend, height = 260 }: {
  years: number[];
  values: (number | null)[];
  smooth?: (number | null)[];
  trend?: (number | null)[];
  height?: number;
}) {
  const p = usePalette();
  const anim = !usePrefersReducedMotion();
  const data = years.map((y, i) => ({ year: y, yield: values[i], smooth: smooth?.[i] ?? null, trend: trend?.[i] ?? null }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="year" {...axisProps(p)} />
        <YAxis {...axisProps(p)} width={48} label={{ value: "t/ha", angle: -90, position: "insideLeft", fill: p.ink2, fontSize: 12 }} />
        <Tooltip {...tooltipProps(p)} formatter={(v) => `${fmt(Number(v))} t/ha`} />
        <Legend wrapperStyle={{ fontSize: 12, color: p.ink2 }} />
        <Line isAnimationActive={anim} animationDuration={1100} animationEasing="ease-out" type="monotone" dataKey="yield" name="Yield" stroke={p.blueSoft} strokeWidth={1.5} dot={{ r: 2.5 }} connectNulls={false} />
        {smooth && <Line isAnimationActive={anim} animationDuration={1100} animationEasing="ease-out" type="monotone" dataKey="smooth" name="5-yr rolling mean" stroke={p.blue} strokeWidth={2.5} dot={false} />}
        {trend && <Line isAnimationActive={anim} animationDuration={1100} animationEasing="ease-out" type="linear" dataKey="trend" name="Linear trend" stroke={p.ink2} strokeWidth={1.5} strokeDasharray="0" dot={false} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RainBarChart({ years, values, height = 200 }: { years: number[]; values: (number | null)[]; height?: number }) {
  const p = usePalette();
  const anim = !usePrefersReducedMotion();
  const data = years.map((y, i) => ({ year: y, rain: values[i] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="year" {...axisProps(p)} />
        <YAxis {...axisProps(p)} width={48} label={{ value: "mm", angle: -90, position: "insideLeft", fill: p.ink2, fontSize: 12 }} />
        <Tooltip {...tooltipProps(p)} cursor={{ fill: p.grid, opacity: 0.4 }} formatter={(v) => `${fmt(Number(v), 0)} mm`} />
        <Bar isAnimationActive={anim} animationDuration={1100} animationEasing="ease-out" dataKey="rain" name="Seasonal rainfall" fill={p.blue} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------------------------
const SHAPES: Record<RainClass, "diamond" | "circle" | "triangle"> = { Drought: "diamond", Normal: "circle", Excess: "triangle" };

export function RainYieldScatter({ points, height = 300 }: {
  points: { x: number; y: number; cls: RainClass; label: string }[];
  height?: number;
}) {
  const p = usePalette();
  const anim = !usePrefersReducedMotion();
  const fit = linreg(points.map((d) => [d.x, d.y] as [number, number]));
  const xs = points.map((d) => d.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 0 }}>
        <CartesianGrid stroke={p.grid} />
        <XAxis type="number" dataKey="x" name="Seasonal rainfall" unit=" mm" {...axisProps(p)} domain={["auto", "auto"]}
          label={{ value: "Seasonal rainfall (mm)", position: "insideBottom", offset: -12, fill: p.ink2, fontSize: 12 }} />
        <YAxis type="number" dataKey="y" name="Yield" unit=" t/ha" {...axisProps(p)} width={70} domain={["auto", "auto"]} />
        <Tooltip {...tooltipProps(p)} cursor={{ strokeDasharray: "0", stroke: p.axis }}
          formatter={(v, n) => [fmt(Number(v), n === "Seasonal rainfall" ? 0 : 2), n]} />
        <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
        {RAIN_CLASSES.map((c) => (
          <Scatter isAnimationActive={anim} animationDuration={1100} animationEasing="ease-out" key={c} name={`${c} (n=${points.filter((d) => d.cls === c).length})`} data={points.filter((d) => d.cls === c)}
            fill={rainClassColor(p, c)} shape={SHAPES[c]} />
        ))}
        {fit && Number.isFinite(x0) && x1 > x0 && (
          <ReferenceLine segment={[{ x: x0, y: fit.intercept + fit.slope * x0 }, { x: x1, y: fit.intercept + fit.slope * x1 }]}
            stroke={p.ink} strokeWidth={1.5} ifOverflow="extendDomain" />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------------------------
/** Round axis step (1, 2 or 5 x 10^n) giving about `count` intervals over `range`. */
function niceStep(range: number, count = 4): number {
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

// Box plot (drawn as SVG; Recharts has no box-plot primitive). Whiskers = 1.5 IQR (Tukey).
export function BoxPlot({ groups, yLabel, height = 280 }: {
  groups: { label: string; values: number[]; color: string }[];
  yLabel: string;
  height?: number;
}) {
  const p = usePalette();
  const W = 520;
  const H = height;
  const m = { t: 12, r: 12, b: 44, l: 56 };
  const all = groups.flatMap((g) => g.values);
  if (!all.length) return <p className="py-8 text-center text-sm text-muted">Not enough data for this selection.</p>;
  const step = niceStep((Math.max(...all, 0) - Math.min(...all, 0)) || 1);
  const lo = Math.floor(Math.min(...all, 0) / step) * step;
  const hi = Math.ceil(Math.max(...all, 0) / step) * step;
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  const bw = (W - m.l - m.r) / groups.length;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Box plots of ${yLabel}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={p.grid} />
          <text x={m.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={p.ink2}>{t.toFixed(0)}</text>
        </g>
      ))}
      <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke={p.axis} strokeWidth={1.2} />
      <text transform={`translate(14 ${(H - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill={p.ink2}>{yLabel}</text>
      {groups.map((g, i) => {
        const cx = m.l + bw * (i + 0.5);
        const label = <text x={cx} y={H - m.b + 18} textAnchor="middle" fontSize={12} fill={p.ink}>{g.label}</text>;
        const n = <text x={cx} y={H - m.b + 34} textAnchor="middle" fontSize={11} fill={p.ink2}>n = {g.values.length}</text>;
        if (g.values.length < 3) return <g key={g.label}>{label}{n}</g>;
        const s = [...g.values].sort((a, b) => a - b);
        const q1 = quantile(s, 0.25);
        const q2 = quantile(s, 0.5);
        const q3 = quantile(s, 0.75);
        const iqr = q3 - q1;
        const wLo = s.find((v) => v >= q1 - 1.5 * iqr) ?? s[0];
        const wHi = [...s].reverse().find((v) => v <= q3 + 1.5 * iqr) ?? s[s.length - 1];
        const out = s.filter((v) => v < wLo || v > wHi);
        const half = Math.min(36, bw * 0.3);
        return (
          <g key={g.label} className="district-in" style={{ animationDelay: `${i * 120}ms` }}>
            <title>{`${g.label}: median ${q2.toFixed(1)}, IQR ${q1.toFixed(1)} to ${q3.toFixed(1)}, n = ${s.length}`}</title>
            <line x1={cx} x2={cx} y1={y(wLo)} y2={y(q1)} stroke={p.muted} />
            <line x1={cx} x2={cx} y1={y(q3)} y2={y(wHi)} stroke={p.muted} />
            <line x1={cx - half / 2} x2={cx + half / 2} y1={y(wLo)} y2={y(wLo)} stroke={p.muted} />
            <line x1={cx - half / 2} x2={cx + half / 2} y1={y(wHi)} y2={y(wHi)} stroke={p.muted} />
            <rect x={cx - half} y={y(q3)} width={half * 2} height={Math.max(1, y(q1) - y(q3))} rx={4}
              fill={g.color} fillOpacity={0.35} stroke={g.color} />
            <line x1={cx - half} x2={cx + half} y1={y(q2)} y2={y(q2)} stroke={p.ink} strokeWidth={2} />
            {out.map((v, j) => <circle key={j} cx={cx} cy={y(v)} r={2.5} fill={p.muted} />)}
            {label}
            {n}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------

export function CorrHeatmap({ rows, cols, cell }: {
  rows: { key: string; label: string }[];
  cols: string[];
  cell: (row: string, col: string) => { r: number; p: number; n: number } | undefined;
}) {
  const p = usePalette();
  const vals = rows.flatMap((r) => cols.map((c) => cell(r.key, c)?.r)).filter((v): v is number => v != null);
  const vmax = Math.max(0.3, Math.ceil(Math.max(...vals.map(Math.abs), 0) * 10) / 10);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">Pearson correlation of climate features with detrended yield anomaly</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left font-medium text-ink-2">Feature</th>
            {cols.map((c) => (
              <th key={c} scope="col" className="px-1 py-1 font-medium text-ink-2">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal text-ink">{r.label}</th>
              {cols.map((c) => {
                const v = cell(r.key, c);
                const sig = v && v.p < 0.05;
                const strong = v && Math.abs(v.r) > 0.6 * vmax;
                return (
                  <td key={c} title={v ? `r = ${v.r.toFixed(2)}, p = ${v.p.toFixed(3)}, n = ${v.n}` : "no data"}
                    className="h-8 min-w-14 rounded text-center tabular-nums"
                    style={{ background: v ? divergingColor(p, v.r, vmax) : "transparent",
                      color: strong ? "#ffffff" : p.ink, fontWeight: sig ? 600 : 400 }}>
                    {v ? (sig ? v.r.toFixed(2) : <span className="opacity-60">{v.r.toFixed(2)}</span>) : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-2">
        <span>r = −{vmax}</span>
        <span className="h-2.5 w-40 rounded" style={{ background: `linear-gradient(90deg, ${p.diverging[0]}, ${p.neutral}, ${p.diverging[5]})` }} aria-hidden="true" />
        <span>+{vmax}</span>
        <span className="ml-2">Bold = p &lt; 0.05</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function HorizontalBars({ data, unit, height }: { data: { label: string; value: number }[]; unit: string; height?: number }) {
  const p = usePalette();
  const anim = !usePrefersReducedMotion();
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(220, data.length * 28 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 16, left: 8 }}>
        <CartesianGrid stroke={p.grid} horizontal={false} />
        <XAxis type="number" {...axisProps(p)} label={{ value: unit, position: "insideBottom", offset: -8, fill: p.ink2, fontSize: 12 }} />
        <YAxis type="category" dataKey="label" {...axisProps(p)} width={170} />
        <Tooltip {...tooltipProps(p)} cursor={{ fill: p.grid, opacity: 0.4 }} formatter={(v) => [`${fmt(Number(v))} ${unit}`, "Mean |SHAP|"]} />
        <Bar isAnimationActive={anim} animationDuration={1100} animationEasing="ease-out" dataKey="value" fill={p.blue} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ActualPredicted({ points, height = 320 }: { points: { x: number; y: number; label: string }[]; height?: number }) {
  const p = usePalette();
  const anim = !usePrefersReducedMotion();
  const all = points.flatMap((d) => [d.x, d.y]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 0 }}>
        <CartesianGrid stroke={p.grid} />
        <XAxis type="number" dataKey="x" name="Actual" unit=" t/ha" {...axisProps(p)} domain={["auto", "auto"]}
          label={{ value: "Actual yield (t/ha)", position: "insideBottom", offset: -12, fill: p.ink2, fontSize: 12 }} />
        <YAxis type="number" dataKey="y" name="Predicted" unit=" t/ha" {...axisProps(p)} width={70} domain={["auto", "auto"]} />
        <Tooltip {...tooltipProps(p)} formatter={(v, n) => [fmt(Number(v)), n]} />
        {Number.isFinite(lo) && hi > lo && (
          <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={p.axis} strokeWidth={1.5} ifOverflow="extendDomain"
            label={{ value: "1:1", position: "insideTopLeft", fill: p.ink2, fontSize: 11 }} />
        )}
        <Scatter isAnimationActive={anim} animationDuration={1100} animationEasing="ease-out" data={points} fill={p.blue} name="District-year" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
