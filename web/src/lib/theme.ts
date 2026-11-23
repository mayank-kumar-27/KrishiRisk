"use client";

import { useEffect, useState } from "react";
import type { Category } from "./types";

// Chart & map palette, matched to the design tokens in globals.css. Light and dark are separately
// chosen steps of the same ramps, not an automatic inversion. Ordinal ramps change lightness
// monotonically, so order stays readable without relying on hue alone.
export const PALETTE = {
  light: {
    surface: "#ffffff",
    ink: "#0f172a",
    ink2: "#475569",
    muted: "#64748b",
    grid: "#e2e8f0",
    axis: "#cbd5e1",
    /** primary data series (yield, model output) - brand emerald */
    primary: "#15803d",
    primarySoft: "#86c99a",
    /** water / rainfall series */
    rain: "#0284c7",
    rainSoft: "#9fd3ef",
    red: "#dc2626",
    gain: "#0f766e",
    neutral: "#eef1f4",
    noData: "#e2e8f0",
    // Ordinal risk ramp: low = pale green, then amber, orange, deep red (light -> dark)
    risk: { Low: "#a7dcb5", Moderate: "#f2c230", High: "#ea6a1f", Severe: "#b91c1c" } as Record<Category, string>,
    // Diverging yield change: red = loss, neutral = no change, teal-green = gain
    diverging: ["#991b1b", "#dc2626", "#f5a3a3", "#eef1f4", "#86d0bf", "#0f766e"],
  },
  dark: {
    surface: "#0d1914",
    ink: "#e4ece8",
    ink2: "#a7b6af",
    muted: "#80918a",
    grid: "#1c2c25",
    axis: "#2a3e35",
    primary: "#22c55e",
    primarySoft: "#2f7a4b",
    rain: "#38bdf8",
    rainSoft: "#1f5f80",
    red: "#f87171",
    gain: "#2dd4bf",
    neutral: "#24302b",
    noData: "#1c2c25",
    // On a dark surface low risk recedes toward the surface and severe risk is brightest
    risk: { Low: "#2b5c3d", Moderate: "#a87d10", High: "#ea6a1f", Severe: "#f87171" } as Record<Category, string>,
    diverging: ["#f87171", "#c94f4f", "#6e2f2f", "#24302b", "#17695e", "#2dd4bf"],
  },
};

export type Palette = (typeof PALETTE)["light"];

export const CATEGORIES: Category[] = ["Low", "Moderate", "High", "Severe"];

// Bins for % yield change (diverging); index into palette.diverging
export const CHANGE_BINS = [
  { max: -20, label: "≤ −20%" },
  { max: -10, label: "−20 to −10%" },
  { max: -3, label: "−10 to −3%" },
  { max: 3, label: "−3 to +3%" },
  { max: 10, label: "+3 to +10%" },
  { max: Infinity, label: "> +10%" },
];

export function changeColor(p: Palette, pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return p.noData;
  const i = CHANGE_BINS.findIndex((b) => pct <= b.max);
  return p.diverging[i];
}

export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function usePalette(): Palette {
  return useIsDark() ? PALETTE.dark : PALETTE.light;
}
