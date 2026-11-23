"use client";

// Printable report assembled from the same pipeline JSON the dashboard uses. "Download PDF" opens
// the browser's print dialog (save as PDF); "Download CSV" exports the district risk table.
import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatNumber } from "@/components/anim";
import { LogoMark } from "@/components/Logo";
import StateMap from "@/components/StateMap";
import { CategoryBadge, Loading, NoData } from "@/components/ui";
import { AFFILIATION, AUTHORS, COURSE, LIMITATIONS, SOURCES } from "@/lib/content";
import { useData } from "@/lib/data";
import { fmt, signed } from "@/lib/stats";
import { CATEGORIES, PALETTE } from "@/lib/theme";
import type { DistrictsGeo, Metrics, Recommendations, ShapImportance, Summary } from "@/lib/types";

const MODEL_LABEL: Record<string, string> = {
  TrendOnly: "Trend only",
  LinearRegression: "Linear Regression",
  RandomForest: "Random Forest",
  XGBoost: "XGBoost",
};
const MODEL_ORDER = ["TrendOnly", "LinearRegression", "RandomForest", "XGBoost"];

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="report-section mt-8">
      <div className="mb-3 flex items-baseline gap-3 border-b border-line pb-2">
        <span className="font-mono text-[11px] font-semibold text-brand-ink">{n}{" //"}</span>
        <h2 className="text-lg font-semibold tracking-[-0.015em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th scope="col" className={`micro h-8 border-b border-line bg-surface-2 px-2 text-left ${className}`}>{children}</th>;
}

export default function ReportView() {
  const summary = useData<Summary>("summary.json");
  const geo = useData<DistrictsGeo>("districts.geojson");
  const metrics = useData<Metrics>("metrics.json");
  const shap = useData<ShapImportance>("shap_importance.json");
  const recs = useData<Recommendations>("recommendations.json");
  const [generated, setGenerated] = useState("");
  useEffect(() => {
    setGenerated(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }));
  }, []);

  const s = summary.data;
  const crops = s?.crops ?? [];
  const ranking = useMemo(
    () =>
      (geo.data?.features ?? [])
        .map((f) => f.properties)
        .sort((a, b) => (b.risk_index ?? -1) - (a.risk_index ?? -1)),
    [geo.data],
  );

  if (summary.loading || geo.loading) return <Loading />;
  if (!s || !geo.data) return <NoData error={summary.error ?? geo.error} />;

  // The report always uses the light palette so the PDF matches the printed page.
  const p = PALETTE.light;
  const h = s.highlights;
  const r = s.records;
  const yearSpan = `${s.years[0]}–${s.years[1]}`;
  const state = s.state ?? "the state";

  const testRows = (metrics.data?.rows ?? [])
    .filter((x) => x.split === "test" && x.crop === "All crops")
    .sort((a, b) => MODEL_ORDER.indexOf(a.model) - MODEL_ORDER.indexOf(b.model));
  const cvRows = (metrics.data?.rows ?? []).filter((x) => x.split === "cv_grouped_by_year" && x.crop === "All crops");
  const drivers = (shap.data?.features ?? []).slice(0, 8);
  const maxShap = Math.max(...drivers.map((d) => d.mean_abs_shap_pct), 1);

  // Severe district-crop pairs, grouped by their (identical) action playbook so each playbook prints once
  const severe = (recs.data?.district_crop ?? []).filter((x) => x.risk_category === "Severe").sort((a, b) => b.risk_index - a.risk_index);
  const playbooks = new Map<string, { ids: string[]; pairs: typeof severe }>();
  severe.forEach((x) => {
    const ids = x.actions.map((a) => a.id);
    const key = ids.join("|");
    const g = playbooks.get(key) ?? { ids, pairs: [] };
    g.pairs.push(x);
    playbooks.set(key, g);
  });

  const downloadCsv = () => {
    const head = ["rank", "district", "risk_index", "risk_category", "top_driver", "profile", ...crops.flatMap((c) => [`${c}_index`, `${c}_category`])];
    const rows = ranking.map((d, i) => [
      d.risk_index == null ? "" : i + 1, d.district, d.risk_index == null ? "" : d.risk_index.toFixed(1), d.risk_category, d.driver, d.cluster,
      ...crops.flatMap((c) => [d.crops[c]?.index == null ? "" : d.crops[c]!.index!.toFixed(1), d.crops[c]?.category ?? ""]),
    ]);
    const csv = [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    downloadFile(`krishirisk-district-risk-${(s.state ?? "state").toLowerCase().replace(/\s+/g, "-")}.csv`, csv, "text/csv;charset=utf-8");
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Toolbar (screen only) */}
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-3">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip h-8 w-8"><FileDown size={16} /></span>
          <div>
            <p className="text-sm font-semibold">Download report</p>
            <p className="font-mono text-[11px] text-muted">PDF via your browser&apos;s print dialog (choose &quot;Save as PDF&quot;) · CSV of the district risk table</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadCsv} className="btn btn-ghost">
            <FileSpreadsheet size={15} /> Download CSV
          </button>
          <button type="button" onClick={() => window.print()} className="btn btn-primary">
            <Printer size={15} /> Download PDF
          </button>
        </div>
      </div>

      {/* The report itself: always light, so screen and PDF match */}
      <article className="report-sheet light-scope rounded-lg border border-line bg-white p-5 text-[#0f172a] sm:p-10" style={{ colorScheme: "light" }}>
        <header className="flex flex-wrap items-start justify-between gap-4 print:flex-nowrap border-b-2 border-[#15803d] pb-5">
          <div className="flex items-center gap-3">
            <LogoMark size={44} />
            <div>
              <p className="text-2xl font-semibold tracking-[-0.02em]">
                Krishi<span className="text-[#15803d]">Risk</span> Climate Risk Report
              </p>
              <p className="text-[13px] text-[#475569]">Agricultural Yield Prediction &amp; Climate Stress Modeling · {state}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 font-mono text-[11px] text-[#475569]">
            <dt>Prepared by</dt><dd className="font-semibold text-[#0f172a]">{AUTHORS}</dd>
            <dt>Affiliation</dt><dd>{AFFILIATION}</dd>
            <dt>Crop years</dt><dd>{yearSpan}</dd>
            <dt>Generated</dt><dd>{generated || "–"}</dd>
          </dl>
        </header>

        <p className="mt-5 text-[14px] leading-6 text-[#334155]">
          This report summarises the KrishiRisk analysis of {s.districts} districts of {state} for {crops.join(", ")}, built from district crop
          statistics ({yearSpan}), NASA POWER daily climate and SoilGrids soil data. It ranks districts on the Climate Stress Risk Index,
          reports how well yields can be predicted on unseen years, lists the climate factors that move yields most and the recommended
          actions for the most exposed districts. Every figure is computed by the project&apos;s reproducible pipeline.
        </p>

        {/* Key figures */}
        <Section n="01" title="Key figures">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4 print:grid-cols-4">
            {[
              { k: "Districts", v: String(s.districts) },
              { k: "District-crop pairs", v: String(s.district_crop_pairs) },
              { k: "Severe pairs", v: `${s.severe_pairs} / ${s.district_crop_pairs}` },
              { k: "Highest risk", v: h ? `${h.top_district.district} · ${Math.round(h.top_district.index)}` : s.highest_risk_district.district },
              ...(r ? [
                { k: "Daily climate records", v: r.climate_daily_records == null ? "–" : formatNumber(r.climate_daily_records) },
                { k: "District-year records", v: formatNumber(r.district_year_records) },
                { k: "Scenario predictions", v: formatNumber(r.scenario_predictions) },
                { k: "Models compared", v: String(r.models_compared) },
              ] : []),
            ].map((x) => (
              <div key={x.k} className="bg-white p-3">
                <p className="micro">{x.k}</p>
                <p className="num mt-1 text-lg font-semibold">{x.v}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Map + findings */}
        <Section n="02" title={`Climate stress across ${state}`}>
          <div className="grid gap-5 md:grid-cols-[1fr_1fr] print:grid-cols-[1fr_1fr]">
            <div className="report-avoid">
              <div className="rounded-md border border-line p-3">
                <StateMap geo={geo.data} ariaLabel={`Map of ${state} districts coloured by climate stress risk`}
                  fill={(d) => (d.risk_category ? p.risk[d.risk_category] : null)}
                  label={(d) => (d.risk_category === "Severe" ? d.district : null)} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {CATEGORIES.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-sm" style={{ background: p.risk[c] }} />
                    {c}
                    {s.district_category_cutoffs?.[c] && (
                      <span className="num text-[#64748b]">{Math.round(s.district_category_cutoffs[c][0])}–{Math.round(s.district_category_cutoffs[c][1])}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
            {h && (
              <ul className="space-y-2.5 text-[13px] leading-5 text-[#334155]">
                <li className="report-avoid rounded-r border-l-2 border-[#15803d] bg-[#f0fdf4] px-3 py-2">
                  <strong className="text-[#0f172a]">{h.top_district.district}</strong> is the most climate-stressed district ({Math.round(h.top_district.index)}/100, {h.top_district.category})
                  {h.top_district.driver ? `, driven mostly by ${h.top_district.driver.toLowerCase()}` : ""}.
                  {h.severe_districts.length > 1 && ` Also Severe: ${h.severe_districts.filter((d) => d !== h.top_district.district).join(", ")}.`}
                </li>
                <li className="report-avoid rounded-r border-l-2 border-[#15803d] bg-[#f0fdf4] px-3 py-2">
                  <strong className="text-[#0f172a]">{h.top_crop.crop}</strong> carries the highest climate stress: {fmt(h.top_crop.mean_index, 0)}/100 on average, Severe in {h.top_crop.severe_districts} of {h.top_crop.districts} districts.
                </li>
                {h.monsoon_share_pct != null && (
                  <li className="report-avoid rounded-r border-l-2 border-[#15803d] bg-[#f0fdf4] px-3 py-2">
                    <strong className="text-[#0f172a]">{formatNumber(h.monsoon_share_pct)}%</strong> of all rain falls between June and September
                    {h.drought_season_pct != null && `; drought-level seasons (SPI-3 below −1) occurred in ${formatNumber(h.drought_season_pct)}% of district-seasons`}.
                  </li>
                )}
                {h.top_driver && (
                  <li className="report-avoid rounded-r border-l-2 border-[#15803d] bg-[#f0fdf4] px-3 py-2">
                    <strong className="text-[#0f172a]">{h.top_driver.label}</strong> moves yields the most: {fmt(h.top_driver.mean_abs_shap_pct, 1)}% of trend yield per season on average (SHAP).
                  </li>
                )}
                {h.worst_scenario && (
                  <li className="report-avoid rounded-r border-l-2 border-[#15803d] bg-[#f0fdf4] px-3 py-2">
                    Worst simulated case: <strong className="text-[#0f172a]">{h.worst_scenario.district} {h.worst_scenario.crop.toLowerCase()}</strong> at {signed(h.worst_scenario.pct, 1)}% under −40% rain and +3 °C.
                  </li>
                )}
              </ul>
            )}
          </div>
        </Section>

        {/* Ranking */}
        <Section n="03" title="District risk ranking">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-[12px]">
              <thead>
                <tr>
                  <Th>#</Th><Th>District</Th><Th>Score</Th><Th>Category</Th><Th>Top driver</Th>
                  {crops.map((c) => <Th key={c} className="text-right">{c}</Th>)}
                </tr>
              </thead>
              <tbody>
                {ranking.map((d, i) => (
                  <tr key={d.district} className="border-b border-line">
                    <td className="num h-8 px-2 text-[#64748b]">{d.risk_index == null ? "–" : String(i + 1).padStart(2, "0")}</td>
                    <td className="px-2 font-semibold">{d.district}</td>
                    <td className="num px-2 font-semibold">{fmt(d.risk_index, 0)}</td>
                    <td className="px-2"><CategoryBadge category={d.risk_category} color={d.risk_category ? p.risk[d.risk_category] : undefined} /></td>
                    <td className="px-2 text-[#475569]">{d.driver ?? "–"}</td>
                    {crops.map((c) => (
                      <td key={c} className="num px-2 text-right">{d.crops[c]?.index == null ? "–" : fmt(d.crops[c]!.index, 0)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[10px] text-[#64748b]">
            Score 0–100, area-weighted over crops; per-crop columns show each district-crop index. Categories are quartiles, relative within the state.
          </p>
        </Section>

        {/* Model */}
        {metrics.data && (
          <Section n="04" title="How well can yields be predicted?">
            <p className="mb-3 text-[13px] leading-5 text-[#334155]">
              Models predict each season&apos;s deviation from the district trend. Trained on {metrics.data.train_years[0]}–{metrics.data.train_years[1]},
              tested on {metrics.data.test_years[0]}–{metrics.data.test_years[1]}. Best model by cross-validation: <strong>{MODEL_LABEL[metrics.data.best_model] ?? metrics.data.best_model}</strong>.
              {!metrics.data.beats_trend_only_cv && " No model beat the trend-only reference in cross-validation, so climate effects are weak and indicative."}
            </p>
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr><Th>Model</Th><Th className="text-right">Test RMSE (t/ha)</Th><Th className="text-right">Test R²</Th><Th className="text-right">R² of deviation</Th><Th className="text-right">CV RMSE (% of trend)</Th></tr>
              </thead>
              <tbody>
                {testRows.map((t) => {
                  const cv = cvRows.find((c) => c.model === t.model);
                  const best = t.model === metrics.data!.best_model;
                  return (
                    <tr key={t.model} className={`border-b border-line ${best ? "bg-[#f0fdf4] font-semibold" : ""}`}>
                      <td className="h-8 px-2">{MODEL_LABEL[t.model] ?? t.model}{best ? " ★" : ""}</td>
                      <td className="num px-2 text-right">{fmt(t.rmse_t_ha, 3)}</td>
                      <td className="num px-2 text-right">{fmt(t.r2)}</td>
                      <td className="num px-2 text-right">{fmt(t.r2_anomaly)}</td>
                      <td className="num px-2 text-right">{cv ? fmt(cv.rmse_pct, 1) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        )}

        {/* Drivers */}
        {drivers.length > 0 && (
          <Section n="05" title="What moves yield">
            <ul className="space-y-1.5">
              {drivers.map((d) => (
                <li key={d.feature} className="grid grid-cols-[11rem_1fr_4rem] items-center gap-3 text-[12px]">
                  <span>{d.label}</span>
                  <span className="h-2 rounded-sm bg-[#f1f5f9]">
                    <span className="block h-full rounded-sm bg-[#15803d]" style={{ width: `${(100 * d.mean_abs_shap_pct) / maxShap}%` }} />
                  </span>
                  <span className="num text-right">{fmt(d.mean_abs_shap_pct)}%</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[10px] text-[#64748b]">Mean |SHAP| as % of trend yield per season. Correlated features share credit.</p>
          </Section>
        )}

        {/* Actions */}
        {recs.data && playbooks.size > 0 && (
          <Section n="06" title="Recommended actions for Severe-risk pairs">
            <div className="space-y-3">
              {[...playbooks.values()].map((g) => (
                <div key={g.ids.join("|")} className="rounded-md border border-line p-3.5">
                  <p className="micro">Applies to {g.pairs.length} district-crop pair{g.pairs.length === 1 ? "" : "s"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.pairs.map((x) => (
                      <span key={`${x.district}|${x.crop}`} className="inline-flex items-center gap-1.5 rounded bg-[#fef2f2] px-1.5 py-0.5 font-mono text-[11px] text-[#0f172a]">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.risk.Severe }} />
                        {x.district} · {x.crop} {fmt(x.risk_index, 0)}
                      </span>
                    ))}
                  </div>
                  <ol className="mt-3 space-y-1.5 text-[12px] leading-[18px] text-[#334155]">
                    {g.ids.map((id, k) => (
                      <li key={id} className="report-avoid flex gap-2.5">
                        <span className="font-mono text-[11px] font-semibold text-[#15803d]">{String(k + 1).padStart(2, "0")}</span>
                        <span><strong className="text-[#0f172a]">{recs.data!.actions[id]?.title ?? id}.</strong> {recs.data!.actions[id]?.detail}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Sources & limitations */}
        <Section n="07" title="Data sources and limitations">
          <div className="grid gap-5 md:grid-cols-2 print:grid-cols-2">
            <ul className="space-y-1.5 text-[12px] leading-[18px] text-[#334155]">
              {SOURCES.map((src) => (
                <li key={src.href}><strong className="text-[#0f172a]">{src.name}:</strong> {src.by}. <span className="font-mono text-[10px] text-[#64748b]">{src.href}</span></li>
              ))}
            </ul>
            <ul className="space-y-1.5 text-[12px] leading-[18px] text-[#334155]">
              {LIMITATIONS.map((l) => <li key={l} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-sm bg-[#15803d]" />{l}</li>)}
            </ul>
          </div>
        </Section>

        <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-3 font-mono text-[10px] text-[#64748b]">
          <span>{AUTHORS} · {AFFILIATION} · {COURSE}</span>
          <span>KrishiRisk · krishirisk.vercel.app</span>
        </footer>
      </article>
    </div>
  );
}
