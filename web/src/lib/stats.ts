// Small descriptive-statistics helpers for the "Insight" captions (computed from the data shown).

export function pairs(x: (number | null)[], y: (number | null)[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const a = x[i];
    const b = y[i];
    if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) out.push([a, b]);
  }
  return out;
}

export function mean(v: number[]): number {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
}

export function std(v: number[]): number {
  if (v.length < 2) return NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(v: number[]): number {
  return quantile([...v].sort((a, b) => a - b), 0.5);
}

export function pearson(p: [number, number][]): number {
  if (p.length < 3) return NaN;
  const mx = mean(p.map((d) => d[0]));
  const my = mean(p.map((d) => d[1]));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of p) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

export function linreg(p: [number, number][]): { slope: number; intercept: number } | null {
  if (p.length < 3) return null;
  const mx = mean(p.map((d) => d[0]));
  const my = mean(p.map((d) => d[1]));
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of p) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  if (!sxx) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

export function rollingMean(v: (number | null)[], window = 5): (number | null)[] {
  const half = Math.floor(window / 2);
  return v.map((_, i) => {
    const w = v.slice(Math.max(0, i - half), i + half + 1).filter((x): x is number => x != null);
    return w.length >= 3 ? mean(w) : null;
  });
}

export function fmt(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(v) ? "–" : v.toFixed(digits);
}

export function signed(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`;
}
