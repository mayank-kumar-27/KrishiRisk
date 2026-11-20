"use client";

import { useEffect, useState } from "react";
import type { Category } from "./types";

// Validated palette (colour-blind checked; see the report). Light and dark are separately chosen
// steps of the same ramps, not an automatic inversion.
export const PALETTE = {
  light: {
    surface: "#fcfcfb",
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    blue: "#2a78d6",
    blueSoft: "#86b6ef",
    red: "#e34948",
    neutral: "#f0efec",
    noData: "#e1e0d9",
    // Ordinal risk ramp (one hue, light -> dark = low -> high risk)
    risk: { Low: "#86b6ef", Moderate: "#3987e5", High: "#1c5cab", Severe: "#0d366b" } as Record<Category, string>,
    // Diverging yield change: red = loss, gray = no change, blue = gain
    diverging: ["#a32f2f", "#e34948", "#f4a9a8", "#f0efec", "#9ec5f4", "#3987e5"],
  },
  dark: {
    surface: "#1a1a19",
    ink: "#f0efec",
    ink2: "#c3c2b7",
    muted: "#898781",
    grid: "#2c2c2a",
    axis: "#383835",
    blue: "#3987e5",
    blueSoft: "#5598e7",
    red: "#e66767",
    neutral: "#383835",
    noData: "#2c2c2a",
    // On a dark surface low values recede toward the surface and high risk is brightest
    risk: { Low: "#184f95", Moderate: "#256abf", High: "#5598e7", Severe: "#9ec5f4" } as Record<Category, string>,
    diverging: ["#e66767", "#c94f4f", "#7a3a3a", "#383835", "#256abf", "#5598e7"],
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
