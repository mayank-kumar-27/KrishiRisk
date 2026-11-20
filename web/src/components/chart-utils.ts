// Colour helpers shared by charts and pages. Kept separate from charts.tsx so pages can use them
// without pulling the charting library into their initial bundle (charts are lazy-loaded).
import type { Palette } from "@/lib/theme";

export type RainClass = "Drought" | "Normal" | "Excess";
export const RAIN_CLASSES: RainClass[] = ["Drought", "Normal", "Excess"];

export function rainClassColor(p: Palette, c: RainClass): string {
  return c === "Drought" ? p.red : c === "Excess" ? p.blue : p.muted;
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

/** Diverging colour for r in [-vmax, vmax]: red (negative) - neutral - blue (positive). */
export function divergingColor(p: Palette, r: number, vmax: number): string {
  const t = Math.max(-1, Math.min(1, r / vmax));
  return t < 0 ? mix(p.neutral, p.diverging[0], -t) : mix(p.neutral, p.diverging[5], t);
}
