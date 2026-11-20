import type { Metadata } from "next";
import ModelView from "./ModelView";

export const metadata: Metadata = {
  title: "Model",
  description: "How well the yield models predict unseen years, and which climate factors move yields (SHAP).",
};

export default function Page() {
  return <ModelView />;
}
