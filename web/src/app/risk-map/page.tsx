import type { Metadata } from "next";
import RiskMapView from "./RiskMapView";

export const metadata: Metadata = {
  title: "Risk Map",
  description: "Climate Stress Risk Index by district and crop, with drivers and recommendations.",
};

export default function Page() {
  return <RiskMapView />;
}
