import type { Metadata } from "next";
import AboutView from "./AboutView";

export const metadata: Metadata = {
  title: "About",
  description: "Data sources, methods, limitations and author of KrishiRisk.",
};

export default function Page() {
  return <AboutView />;
}
