"use client";

// Charts are loaded on demand (next/dynamic) so Recharts stays out of each page's initial bundle.
// Pages import charts from here; colour helpers come from ./chart-utils.
import dynamic from "next/dynamic";
import { Skeleton } from "./anim";

export const YieldTrendChart = dynamic(() => import("./charts").then((m) => m.YieldTrendChart), {
  ssr: false, loading: () => <Skeleton height={240} />,
});
export const RainBarChart = dynamic(() => import("./charts").then((m) => m.RainBarChart), {
  ssr: false, loading: () => <Skeleton height={160} />,
});
export const RainYieldScatter = dynamic(() => import("./charts").then((m) => m.RainYieldScatter), {
  ssr: false, loading: () => <Skeleton height={300} />,
});
export const BoxPlot = dynamic(() => import("./charts").then((m) => m.BoxPlot), {
  ssr: false, loading: () => <Skeleton height={280} />,
});
export const CorrHeatmap = dynamic(() => import("./charts").then((m) => m.CorrHeatmap), {
  ssr: false, loading: () => <Skeleton height={420} />,
});
export const HorizontalBars = dynamic(() => import("./charts").then((m) => m.HorizontalBars), {
  ssr: false, loading: () => <Skeleton height={400} />,
});
export const ActualPredicted = dynamic(() => import("./charts").then((m) => m.ActualPredicted), {
  ssr: false, loading: () => <Skeleton height={320} />,
});
