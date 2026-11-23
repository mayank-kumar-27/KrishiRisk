"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so it is loaded only in the browser.
export const ChoroplethMap = dynamic(() => import("./ChoroplethMap"), {
  ssr: false,
  loading: () => <div className="flex h-[480px] items-center justify-center font-mono text-xs text-muted">Loading map…</div>,
});

export function escapeHtml(s: string | number | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
