"use client";

import { useMemo, useState } from "react";
import { BoxPlot, CorrHeatmap, RAIN_CLASSES, RainYieldScatter, YieldTrendChart, rainClassColor, type RainClass } from "@/components/charts";
import { Card, Insight, Loading, NoData, PageHeader, Select } from "@/components/ui";
import { useData } from "@/lib/data";
import { fmt, linreg, mean, median, pairs, pearson, rollingMean, signed } from "@/lib/stats";
import { usePalette } from "@/lib/theme";
import type { Correlations, Series, Timeseries } from "@/lib/types";

const ALL = "__all__";
const SPI_DRY = -1;
const SPI_WET = 1;
const DEP = 20; // IMD categories: deficit <= -20%, excess >= +20% of the district normal

export default function ExploreView() {
  const ts = useData<Timeseries>("timeseries.json");
  const corr = useData<Correlations>("correlations.json");
  const p = usePalette();
  const [cropSel, setCrop] = useState<string | null>(null);
  const [district, setDistrict] = useState(ALL);

  const crops = ts.data?.crops ?? [];
  const crop = cropSel ?? crops[0] ?? "";
  const districts = useMemo(
    () => Object.keys(ts.data?.district ?? {}).filter((d) => ts.data!.district[d][crop]).sort(),
    [ts.data, crop],
  );
  const dSel = district !== ALL && districts.includes(district) ? district : ALL;
  const seriesList: [string, Series][] = useMemo(() => {
    if (!ts.data) return [];
    return (dSel === ALL ? districts : [dSel]).map((d) => [d, ts.data!.district[d][crop]] as [string, Series]).filter(([, s]) => s);
  }, [ts.data, districts, dSel, crop]);

  // Points shared by the scatter and the box plot
  const points = useMemo(() => {
    const out: { district: string; year: number; rain: number; yield: number | null; anom: number | null; spi: number | null; dep: number }[] = [];
    for (const [d, s] of seriesList) {
      const normal = mean(s.rain_mm.filter((v): v is number => v != null));
      s.year.forEach((y, i) => {
        const r = s.rain_mm[i];
        if (r == null) return;
        out.push({ district: d, year: y, rain: r, yield: s.yield[i], anom: s.anomaly_pct[i], spi: s.spi3[i], dep: 100 * (r / normal - 1) });
      });
    }
    return out;
  }, [seriesList]);

  if (ts.loading) return <Loading />;
  if (!ts.data) return <><PageHeader title="Explore" /><NoData error={ts.error} /></>;

  // 1. Trend
  const trendSeries = dSel === ALL ? ts.data.state[crop] : ts.data.district[dSel]?.[crop];
  const tp = trendSeries ? pairs(trendSeries.year, trendSeries.yield) : [];
  const fit = linreg(tp);
  const pctPerYr = fit ? (100 * fit.slope) / mean(tp.map((d) => d[1])) : NaN;

  // 2. Scatter
  const sc = points.filter((d) => d.yield != null).map((d) => ({
    x: d.rain, y: d.yield as number, label: `${d.district} ${d.year}`,
    cls: (d.spi == null ? "Normal" : d.spi <= SPI_DRY ? "Drought" : d.spi >= SPI_WET ? "Excess" : "Normal") as RainClass,
  }));
  const rRaw = pearson(sc.map((d) => [d.x, d.y]));
  const rAnom = pearson(pairs(points.map((d) => d.dep), points.map((d) => d.anom)));

  // 3. Box plot
  const groups = (["Deficit", "Normal", "Excess"] as const).map((g, i) => ({
    label: g,
    color: rainClassColor(p, RAIN_CLASSES[i]),
    values: points
      .filter((d) => d.anom != null && (g === "Deficit" ? d.dep <= -DEP : g === "Excess" ? d.dep >= DEP : d.dep > -DEP && d.dep < DEP))
      .map((d) => d.anom as number),
  }));
  const medDef = groups[0].values.length ? median(groups[0].values) : NaN;
  const medNor = groups[1].values.length ? median(groups[1].values) : NaN;

  // 4. Heatmap
  const corrRows = corr.data?.rows ?? [];
  const featureKeys = Array.from(new Map(corrRows.map((r) => [r.feature, r.label])).entries()).map(([key, label]) => ({ key, label }));
  const corrCols = [...crops, "All crops"].filter((c) => corrRows.some((r) => r.crop === c));
  const cell = (f: string, c: string) => corrRows.find((r) => r.feature === f && r.crop === c);
  const strongest = [...corrRows].filter((r) => r.p < 0.05).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  const nSig = corrRows.filter((r) => r.p < 0.05).length;

  const where = dSel === ALL ? "the state" : dSel;
  return (
    <div>
      <PageHeader title="Explore the data" lead="How yields have moved, and how they respond to rainfall and climate, for any crop and district." />
      <div className="mb-5 flex flex-wrap gap-4">
        <Select label="Crop" value={crop} onChange={(v) => setCrop(v)} options={crops.map((c) => ({ value: c, label: c }))} />
        <Select label="District" value={dSel} onChange={setDistrict}
          options={[{ value: ALL, label: "All districts" }, ...districts.map((d) => ({ value: d, label: d }))]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Yield trend — ${crop}, ${where}`}>
          {trendSeries ? (
            <>
              <YieldTrendChart years={trendSeries.year} values={trendSeries.yield}
                smooth={dSel === ALL ? rollingMean(trendSeries.yield) : undefined}
                trend={dSel !== ALL ? (trendSeries as Series).trend : undefined} />
              <Insight>
                {Number.isFinite(pctPerYr)
                  ? `${crop} yield in ${where} changed by ${signed(pctPerYr, 2)}% of its mean per year (linear fit, ${tp[0]?.[0]}–${tp[tp.length - 1]?.[0]}).`
                  : "Too few years for a trend."}
                {dSel === ALL && " State yield = total production ÷ total area of reporting districts."}
              </Insight>
            </>
          ) : <p className="text-sm text-muted">No series for this selection.</p>}
        </Card>

        <Card title={`Seasonal rainfall vs yield — ${crop}, ${where}`}>
          {sc.length >= 3 ? (
            <>
              <RainYieldScatter points={sc} />
              <Insight>
                Rainfall vs yield r = {fmt(rRaw)} (n = {sc.length}). Against detrended yield anomaly, rainfall departure gives
                r = {fmt(rAnom)} — {Math.abs(rAnom) < 0.2 ? "a weak link: other factors dominate year-to-year swings." : rAnom > 0 ? "wetter seasons tend to yield more." : "wetter seasons tend to yield less."}
              </Insight>
            </>
          ) : <p className="text-sm text-muted">Not enough points.</p>}
        </Card>

        <Card title={`Yield anomaly by rainfall category — ${crop}, ${where}`}>
          <BoxPlot groups={groups} yLabel="Yield anomaly vs trend (%)" />
          <Insight>
            {Number.isFinite(medDef) && Number.isFinite(medNor)
              ? `Median yield anomaly is ${signed(medDef)}% in rainfall-deficit seasons vs ${signed(medNor)}% in normal ones (deficit/excess = ≤ −${DEP}% / ≥ +${DEP}% of the district's average seasonal rain).`
              : "Too few deficit or normal seasons in this selection to compare."}
          </Insight>
        </Card>

        <Card title="Climate features vs yield anomaly (state level)">
          {corr.data && featureKeys.length ? (
            <>
              <CorrHeatmap rows={featureKeys} cols={corrCols} cell={cell} />
              <Insight>
                {strongest
                  ? `${nSig} of ${corrRows.length} correlations are significant (p < 0.05); the strongest is ${strongest.label} for ${strongest.crop} (r = ${fmt(strongest.r)}).`
                  : "No feature-crop correlation is significant at p < 0.05."}{" "}
                Computed across all districts; the district filter does not apply here.
              </Insight>
            </>
          ) : <NoData error={corr.error} />}
        </Card>
      </div>
    </div>
  );
}
