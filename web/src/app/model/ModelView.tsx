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
        lead={`Models predict how far each district's yield falls above or below its own trend, using season climate and soil. Trained on ${d.train_years[0]}–${d.train_years[1]} and tested on ${d.test_years[0]}–${d.test_years[1]} — years they never saw. The best model was chosen by cross-validation on the training years only.`} />
      {!d.beats_trend_only_cv && (
        <div className="mb-6">
          <Callout>No model beat the trend-only reference in cross-validation: weather and soil add little predictive skill beyond each district&apos;s trend. SHAP results below are descriptive.</Callout>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MODEL_ORDER.map((name, i) => {
          const t = test.find((r) => r.model === name);
          const c = cv.find((r) => r.model === name);
          if (!t) return null;
          const isBest = name === d.best_model;
          return (
            <Reveal key={name} delay={i * 80} className="h-full">
              <div className={`card card-hover relative h-full p-5 ${isBest ? "ring-2 ring-brand/60" : ""}`}>
                {isBest && (
                  <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-md"
                    style={{ background: "linear-gradient(100deg, var(--brand), var(--accent))" }}>
                    <Trophy size={12} /> Best in CV
                  </span>
                )}
                <p className="font-display text-lg font-bold">{MODEL_LABEL[name]}</p>
                <p className="mt-0.5 text-xs text-muted">{MODEL_NOTE[name]}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Test error (RMSE)</p>
                <p className="font-display text-3xl font-extrabold tabular-nums">
                  <CountUp value={t.rmse_t_ha} decimals={3} /> <span className="text-base font-bold text-ink-2">t/ha</span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                  <span className="bar-grow block h-full rounded-full" style={{ width: `${(100 * t.rmse_t_ha) / maxRmse}%`, background: isBest ? "linear-gradient(90deg, var(--brand), var(--accent))" : "var(--muted)" }} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-muted">CV error</dt><dd className="font-semibold tabular-nums">{c ? `${fmt(c.rmse_pct, 1)}% of trend` : "–"}</dd></div>
                  <div><dt className="text-muted">R² of deviation</dt><dd className="font-semibold tabular-nums">{fmt(t.r2_anomaly)}</dd></div>
                </dl>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="mt-6">
        <div className="card flex gap-4 p-5">
          <span className="icon-chip h-10 w-10 shrink-0"><Scale size={18} /></span>
          <p className="text-sm leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">Reading these numbers honestly. </span>
            {best && ref
              ? `On held-out years ${MODEL_LABEL[d.best_model]} has an error of ${fmt(best.rmse_t_ha, 3)} t/ha against ${fmt(ref.rmse_t_ha, 3)} t/ha for the trend alone. Most of the overall R² comes from each district's trend; the "R² of deviation" — how much of the year-to-year swing the model explains — is the real test of what climate and soil add.`
              : "Metrics unavailable."}
          </p>
        </div>
      </Reveal>

      <Reveal className="mt-6">
        <Card title="Full comparison" subtitle="Per crop and across all crops" icon={Sparkles}
          action={<Segmented id="model-split" label="Evaluation" value={split} onChange={setSplit}
            options={[{ value: "test", label: "Test years" }, { value: "cv", label: "Cross-validation" }]} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Model metrics</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  {["Crop", "Model", "n", "RMSE (t/ha)", "MAE (t/ha)", "R²", "RMSE (% of trend)", "R² of deviation"].map((h) => (
                    <th key={h} scope="col" className="py-2.5 pr-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.crop}-${r.model}`} className={`border-b border-line/60 ${r.model === d.best_model ? "bg-brand-soft/40 font-semibold" : ""}`}>
                    <td className="py-2 pr-3">{r.crop}</td>
                    <td className="py-2 pr-3">{MODEL_LABEL[r.model] ?? r.model}{r.model === d.best_model ? " ★" : ""}</td>
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <Card title="What moves yield" subtitle="Mean |SHAP| — average effect per season" icon={Sparkles}>
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
                  Actual and predicted yields correlate at r = {fmt(pearson(pts.map((q) => [q.x, q.y])))} over {pts.length} district-years
                  — mostly because the trend captures each district&apos;s level; points on the 1:1 line are perfect predictions.
                </Insight>
              </>
            ) : <NoData />}
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
