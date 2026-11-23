"use client";

import { BrainCircuit, ChartScatter, Scale, Sparkles, Trophy } from "lucide-react";
import { useState } from "react";
import { CountUp, Reveal, WhenVisible } from "@/components/anim";
import { ActualPredicted, HorizontalBars } from "@/components/charts-lazy";
import { Callout, Card, Insight, Loading, NoData, PageHeader, Segmented } from "@/components/ui";
import { useData } from "@/lib/data";
import { fmt, pearson } from "@/lib/stats";
import type { Metrics, ShapImportance } from "@/lib/types";

const MODEL_ORDER = ["TrendOnly", "LinearRegression", "RandomForest", "XGBoost"];
const MODEL_LABEL: Record<string, string> = {
  TrendOnly: "Trend only",
  LinearRegression: "Linear Regression",
  RandomForest: "Random Forest",
  XGBoost: "XGBoost",
};
const MODEL_NOTE: Record<string, string> = {
  TrendOnly: "Reference: each district's own yield trend, no weather",
  LinearRegression: "Additive effects of climate and soil",
  RandomForest: "Averaged decision trees, captures non-linear effects",
  XGBoost: "Gradient-boosted trees, tuned with time-series CV",
};

export default function ModelView() {
  const m = useData<Metrics>("metrics.json");
  const shap = useData<ShapImportance>("shap_importance.json");
  const [split, setSplit] = useState("test");

  if (m.loading) return <Loading />;
  if (!m.data) return <><PageHeader title="Model" /><NoData error={m.error} /></>;
  const d = m.data;
  const all = (sp: string) => d.rows.filter((r) => r.split === sp && r.crop === "All crops");
  const test = all("test");
  const cv = all("cv_grouped_by_year");
  const maxRmse = Math.max(...test.map((r) => r.rmse_t_ha));
  const rows = d.rows
    .filter((r) => r.split === (split === "test" ? "test" : "cv_grouped_by_year"))
    .sort((a, b) => {
      const ca = a.crop === "All crops" ? "" : a.crop; // "All crops" first, then alphabetical
      const cb = b.crop === "All crops" ? "" : b.crop;
      return ca.localeCompare(cb) || MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model);
    });
  const best = test.find((r) => r.model === d.best_model);
  const ref = test.find((r) => r.model === "TrendOnly");
  const bars = (shap.data?.features ?? []).map((f) => ({ label: f.label, value: f.mean_abs_shap_pct }));
  const pts = d.test_predictions.map((r) => ({ x: r.actual_t_ha, y: r.predicted_t_ha, label: `${r.district} ${r.crop} ${r.year}` }));

  return (
    <div>
      <PageHeader eyebrow="Model" icon={BrainCircuit} title="How well can we predict yields?"
        lead={`Models predict how far each district's yield falls above or below its own trend, using season climate and soil. Trained on ${d.train_years[0]}–${d.train_years[1]} and tested on ${d.test_years[0]}–${d.test_years[1]}, years they never saw. The best model was chosen by cross-validation on the training years only.`}
        meta={[`Train ${d.train_years[0]}–${d.train_years[1]}`, `Test ${d.test_years[0]}–${d.test_years[1]}`, "Time-split validation", "SHAP explanations"]} />
      {!d.beats_trend_only_cv && (
        <div className="mb-5">
          <Callout>No model beat the trend-only reference in cross-validation: weather and soil add little predictive skill beyond each district&apos;s trend. SHAP results below are descriptive.</Callout>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MODEL_ORDER.map((name, i) => {
          const t = test.find((r) => r.model === name);
          const c = cv.find((r) => r.model === name);
          if (!t) return null;
          const isBest = name === d.best_model;
          return (
            <Reveal key={name} delay={i * 80} className="h-full">
              <div className={`card card-hover relative h-full p-4 ${isBest ? "!border-brand bg-brand-soft/40 shadow-[0_0_0_1px_var(--brand)]" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 text-base font-semibold">
                    <span className={`h-1.5 w-1.5 rounded-full ${isBest ? "bg-brand" : "bg-muted"}`} aria-hidden="true" />
                    {MODEL_LABEL[name]}
                  </p>
                  {isBest && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-brand-solid px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                      <Trophy size={11} /> Best in CV
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-[18px] text-muted">{MODEL_NOTE[name]}</p>
                <p className="micro mt-4">Test error (RMSE)</p>
                <p className="num mt-1 text-[28px] font-semibold leading-8">
                  <CountUp value={t.rmse_t_ha} decimals={3} /> <span className="text-sm font-medium text-muted">t/ha</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-surface-2">
                  <span className={`bar-grow block h-full rounded-sm ${isBest ? "bg-brand" : "bg-muted/60"}`} style={{ width: `${(100 * t.rmse_t_ha) / maxRmse}%` }} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
                  <div><dt className="micro">CV error</dt><dd className="num mt-0.5 font-semibold">{c ? `${fmt(c.rmse_pct, 1)}% of trend` : "–"}</dd></div>
                  <div><dt className="micro">R² of deviation</dt><dd className="num mt-0.5 font-semibold">{fmt(t.r2_anomaly)}</dd></div>
                </dl>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="mt-4">
        <div className="card flex gap-3 border-l-2 !border-l-brand p-4">
          <span className="icon-chip h-8 w-8 shrink-0"><Scale size={16} /></span>
          <p className="text-[13px] leading-5 text-ink-2">
            <span className="font-semibold text-ink">Reading these numbers honestly. </span>
            {best && ref
              ? `On held-out years ${MODEL_LABEL[d.best_model]} has an error of ${fmt(best.rmse_t_ha, 3)} t/ha against ${fmt(ref.rmse_t_ha, 3)} t/ha for the trend alone. Most of the overall R² comes from each district's trend; the "R² of deviation" (how much of the year-to-year swing the model explains) is the real test of what climate and soil add.`
              : "Metrics unavailable."}
          </p>
        </div>
      </Reveal>

      <Reveal className="mt-4">
        <Card title="Full comparison" subtitle="Per crop and across all crops" icon={Sparkles}
          action={<Segmented id="model-split" label="Evaluation" value={split} onChange={setSplit}
            options={[{ value: "test", label: "Test years" }, { value: "cv", label: "Cross-validation" }]} />}>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[46rem] font-mono text-xs tabular-nums">
              <caption className="sr-only">Model metrics</caption>
              <thead>
                <tr className="border-y border-line bg-surface-2 text-left">
                  {["Crop", "Model", "n", "RMSE (t/ha)", "MAE (t/ha)", "R²", "RMSE (% of trend)", "R² of deviation"].map((h) => (
                    <th key={h} scope="col" className="micro h-9 pr-3 font-sans first:pl-4 sm:first:pl-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.crop}-${r.model}`} className={`h-10 border-b border-line transition-colors hover:bg-surface-2/70 ${r.model === d.best_model ? "bg-brand-soft font-semibold text-brand-ink" : ""}`}>
                    <td className="py-2 pl-4 pr-3 font-sans text-[13px] font-medium text-ink sm:pl-5">{r.crop}</td>
                    <td className="py-2 pr-3 font-sans text-[13px]">{MODEL_LABEL[r.model] ?? r.model}{r.model === d.best_model ? " ★" : ""}</td>
                    <td className="py-2 pr-3">{r.n}</td>
                    <td className="py-2 pr-3">{fmt(r.rmse_t_ha, 3)}</td>
                    <td className="py-2 pr-3">{fmt(r.mae_t_ha, 3)}</td>
                    <td className="py-2 pr-3">{fmt(r.r2)}</td>
                    <td className="py-2 pr-3">{fmt(r.rmse_pct, 1)}</td>
                    <td className="py-2 pr-3">{fmt(r.r2_anomaly)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <Card title="What moves yield" subtitle="Mean |SHAP|, average effect per season" icon={Sparkles}>
            {bars.length ? (
              <>
                <WhenVisible height={420}>
                  <HorizontalBars data={bars} unit="% of trend yield" />
                </WhenVisible>
                <Insight>
                  {bars[0].label} has the largest average effect ({fmt(bars[0].value)}% of trend yield per season), followed
                  by {bars[1]?.label ?? "–"} ({fmt(bars[1]?.value)}%). Correlated features (rainfall, SPI, dry spells) share credit.
                </Insight>
              </>
            ) : <NoData error={shap.error} />}
          </Card>
        </Reveal>
        <Reveal delay={80}>
          <Card title="Actual vs predicted" subtitle={`Test years ${d.test_years[0]}–${d.test_years[1]}`} icon={ChartScatter}>
            {pts.length ? (
              <>
                <WhenVisible height={320}>
                  <ActualPredicted points={pts} />
                </WhenVisible>
                <Insight>
                  Actual and predicted yields correlate at r = {fmt(pearson(pts.map((q) => [q.x, q.y])))} over {pts.length} district-years,
                  mostly because the trend captures each district&apos;s level; points on the 1:1 line are perfect predictions.
                </Insight>
              </>
            ) : <NoData />}
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
