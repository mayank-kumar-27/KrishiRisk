"use client";

import { useState } from "react";
import { ActualPredicted, HorizontalBars } from "@/components/charts";
import { Card, Insight, Loading, NoData, PageHeader, Select, Warning } from "@/components/ui";
import { useData } from "@/lib/data";
import { fmt, pearson } from "@/lib/stats";
import type { Metrics, ShapImportance } from "@/lib/types";

const MODEL_ORDER = ["TrendOnly", "LinearRegression", "RandomForest", "XGBoost"];
const MODEL_LABEL: Record<string, string> = {
  TrendOnly: "Trend only (reference)",
  LinearRegression: "Linear Regression",
  RandomForest: "Random Forest",
  XGBoost: "XGBoost",
};

export default function ModelView() {
  const m = useData<Metrics>("metrics.json");
  const shap = useData<ShapImportance>("shap_importance.json");
  const [split, setSplit] = useState("test");

  if (m.loading) return <Loading />;
  if (!m.data) return <><PageHeader title="Model" /><NoData error={m.error} /></>;
  const d = m.data;
  const rows = d.rows
    .filter((r) => r.split === (split === "test" ? "test" : "cv_grouped_by_year"))
    .sort((a, b) => {
      const ca = a.crop === "All crops" ? "" : a.crop; // "All crops" first, then alphabetical
      const cb = b.crop === "All crops" ? "" : b.crop;
      return ca.localeCompare(cb) || MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model);
    });
  const allTest = d.rows.filter((r) => r.split === "test" && r.crop === "All crops");
  const best = allTest.find((r) => r.model === d.best_model);
  const ref = allTest.find((r) => r.model === "TrendOnly");
  const bars = (shap.data?.features ?? []).map((f) => ({ label: f.label, value: f.mean_abs_shap_pct }));
  const pts = d.test_predictions.map((r) => ({ x: r.actual_t_ha, y: r.predicted_t_ha, label: `${r.district} ${r.crop} ${r.year}` }));

  return (
    <div>
      <PageHeader title="Model"
        lead={`Models predict how far each district's yield falls above or below its own trend, using season climate and soil. Trained on ${d.train_years[0]}–${d.train_years[1]}; tested on ${d.test_years[0]}–${d.test_years[1]}, years the models never saw. The best model (${MODEL_LABEL[d.best_model] ?? d.best_model}) was chosen by cross-validation on training years only.`} />
      {!d.beats_trend_only_cv && (
        <div className="mb-4">
          <Warning>
            No model beat the trend-only reference in cross-validation: with this data, weather and soil features add
            little predictive skill beyond each district&apos;s long-term trend. SHAP results below are descriptive.
          </Warning>
        </div>
      )}

      <Card title="Model comparison" action={
        <Select label="Evaluation" value={split} onChange={setSplit}
          options={[{ value: "test", label: "Test (held-out years)" }, { value: "cv", label: "Grouped CV by year (training)" }]} />
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Model metrics</caption>
            <thead>
              <tr className="border-b border-line text-left text-ink-2">
                {["Crop", "Model", "n", "RMSE (t/ha)", "MAE (t/ha)", "R²", "RMSE (% of trend)", "R² of deviation"].map((h) => (
                  <th key={h} scope="col" className="py-2 pr-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.crop}-${r.model}`} className={`border-b border-line/60 ${r.model === d.best_model ? "bg-accent/5 font-medium" : ""}`}>
                  <td className="py-1.5 pr-3">{r.crop}</td>
                  <td className="py-1.5 pr-3">{MODEL_LABEL[r.model] ?? r.model}{r.model === d.best_model ? " ★" : ""}</td>
                  <td className="py-1.5 pr-3">{r.n}</td>
                  <td className="py-1.5 pr-3">{fmt(r.rmse_t_ha, 3)}</td>
                  <td className="py-1.5 pr-3">{fmt(r.mae_t_ha, 3)}</td>
                  <td className="py-1.5 pr-3">{fmt(r.r2)}</td>
                  <td className="py-1.5 pr-3">{fmt(r.rmse_pct, 1)}</td>
                  <td className="py-1.5 pr-3">{fmt(r.r2_anomaly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Insight>
          {best && ref
            ? `On held-out years ${MODEL_LABEL[d.best_model]} has RMSE ${fmt(best.rmse_t_ha, 3)} t/ha vs ${fmt(ref.rmse_t_ha, 3)} for the trend alone. Most of the overall R² comes from the trend; "R² of deviation" (${fmt(best.r2_anomaly)}) is what climate and soil add.`
            : "Metrics unavailable."}
        </Insight>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="What moves yield: mean |SHAP|">
          {bars.length ? (
            <>
              <HorizontalBars data={bars} unit="% of trend yield" />
              <Insight>
                {bars[0].label} has the largest average effect ({fmt(bars[0].value)}% of trend yield per season), followed
                by {bars[1]?.label ?? "–"} ({fmt(bars[1]?.value)}%). Correlated features (rainfall, SPI, dry spells) share credit.
              </Insight>
            </>
          ) : <NoData error={shap.error} />}
        </Card>
        <Card title="Actual vs predicted yield (test years)">
          {pts.length ? (
            <>
              <ActualPredicted points={pts} />
              <Insight>
                Correlation between actual and predicted yields is r = {fmt(pearson(pts.map((q) => [q.x, q.y])))} over{" "}
                {pts.length} district-years; points on the 1:1 line are perfect predictions.
              </Insight>
            </>
          ) : <NoData />}
        </Card>
      </div>
    </div>
  );
}
