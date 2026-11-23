import type { Metadata } from "next";
import ReportView from "./ReportView";

export const metadata: Metadata = {
  title: "Download report",
  description: "Printable KrishiRisk climate risk report: risk ranking, model performance, yield drivers and recommended actions.",
};

export default function Page() {
  return <ReportView />;
}
