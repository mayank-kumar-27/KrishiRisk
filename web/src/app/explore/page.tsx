import type { Metadata } from "next";
import ExploreView from "./ExploreView";

export const metadata: Metadata = {
  title: "Explore",
  description: "Yield trends, rainfall-yield relationships and climate correlations by district and crop.",
};

export default function Page() {
  return <ExploreView />;
}
