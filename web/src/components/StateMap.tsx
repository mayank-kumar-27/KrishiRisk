"use client";

// Lightweight SVG choropleth (no map library): equirectangular projection scaled by cos(latitude),
// which is accurate enough for a single state. Colours transition smoothly when `fill` changes.
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DistrictProps, DistrictsGeo } from "@/lib/types";

interface Shape {
  district: string;
  props: DistrictProps;
  d: string;
  cx: number;
  cy: number;
}

function polygonsOf(g: GeoJSON.Geometry): GeoJSON.Position[][][] {
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

function buildShapes(geo: DistrictsGeo, width: number) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f of geo.features)
    for (const poly of polygonsOf(f.geometry))
      for (const ring of poly)
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const s = width / ((maxLon - minLon) * kx);
  const height = (maxLat - minLat) * s;
  const pt = (lon: number, lat: number): [number, number] => [(lon - minLon) * kx * s, (maxLat - lat) * s];

  const shapes: Shape[] = geo.features.map((f) => {
    let d = "";
    let best = { area: 0, cx: 0, cy: 0 };
    for (const poly of polygonsOf(f.geometry)) {
      poly.forEach((ring, ri) => {
        const pts = ring.map(([lon, lat]) => pt(lon, lat));
        d += "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z";
        if (ri === 0) {
          // area-weighted centroid of the outer ring (shoelace); keep the largest part for labels
          let a = 0, cx = 0, cy = 0;
          for (let i = 0; i < pts.length - 1; i++) {
            const c = pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
            a += c;
            cx += (pts[i][0] + pts[i + 1][0]) * c;
            cy += (pts[i][1] + pts[i + 1][1]) * c;
          }
          if (Math.abs(a) > best.area && a !== 0) best = { area: Math.abs(a), cx: cx / (3 * a), cy: cy / (3 * a) };
        }
      });
    }
    return { district: f.properties.district, props: f.properties, d, cx: best.cx, cy: best.cy };
  });
  return { shapes, width, height };
}

export default function StateMap({ geo, fill, tooltip, onSelect, selected, label, ariaLabel, className = "" }: {
  geo: DistrictsGeo;
  /** colour for a district, or null when it has no data (drawn as a dashed outline) */
  fill: (d: DistrictProps) => string | null;
  tooltip?: (d: DistrictProps) => ReactNode;
  onSelect?: (district: string) => void;
  selected?: string | null;
  /** optional text label drawn on the map */
  label?: (d: DistrictProps) => string | null;
  ariaLabel: string;
  className?: string;
}) {
  const { shapes, width, height } = useMemo(() => buildShapes(geo, 1000), [geo]);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ d: DistrictProps; x: number; y: number } | null>(null);

  const place = (d: DistrictProps, clientX: number, clientY: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ d, x: clientX - r.left, y: clientY - r.top });
  };
  const placeAtCentroid = (s: Shape) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ d: s.props, x: (s.cx / width) * r.width, y: (s.cy / height) * r.height });
  };

  return (
    <div ref={wrap} className={`relative ${className}`} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`-8 -8 ${width + 16} ${height + 16}`} className="h-auto w-full" role="group" aria-label={ariaLabel}>
        {shapes.map((s) => {
          const color = fill(s.props);
          const isSel = selected === s.district;
          const isHover = hover?.d.district === s.district;
          const style: CSSProperties = {
            fill: color ?? "transparent",
            stroke: color == null ? "var(--muted)" : isSel || isHover ? "var(--ink)" : "var(--surface)",
            strokeWidth: isSel ? 2.6 : isHover ? 2 : color == null ? 1 : 1.2,
            strokeDasharray: color == null ? "4 4" : undefined,
            animationDelay: `${Math.round((s.cx / width) * 700)}ms`,
            cursor: onSelect ? "pointer" : "default",
          };
          return (
            <path
              key={s.district}
              d={s.d}
              className="map-path district-in"
              style={style}
              vectorEffect="non-scaling-stroke"
              tabIndex={onSelect ? 0 : -1}
              role={onSelect ? "button" : undefined}
              aria-label={onSelect ? `${s.district}` : undefined}
              aria-pressed={onSelect ? isSel : undefined}
              onMouseMove={(e) => place(s.props, e.clientX, e.clientY)}
              onFocus={() => placeAtCentroid(s)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(s.district)}
              onKeyDown={(e) => {
                if (onSelect && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect(s.district);
                }
              }}
            />
          );
        })}
        {label &&
          shapes.map((s) => {
            const t = label(s.props);
            if (!t) return null;
            return (
              <text
                key={`l-${s.district}`}
                x={s.cx}
                y={s.cy}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                style={{ fontSize: 22, fontWeight: 700, fill: "var(--ink)", stroke: "var(--surface)", strokeWidth: 5, paintOrder: "stroke" }}
              >
                {t}
              </text>
            );
          })}
      </svg>
      {hover && tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-max max-w-60 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl border border-line bg-surface px-3 py-2 text-xs leading-relaxed shadow-[var(--shadow-lift)]"
          style={{ left: hover.x, top: hover.y }}
        >
          {tooltip(hover.d)}
        </div>
      )}
    </div>
  );
}
