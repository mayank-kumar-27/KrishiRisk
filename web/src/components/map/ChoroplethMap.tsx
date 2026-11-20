"use client";

// Leaflet choropleth without basemap tiles (the site makes no external requests).
// Loaded only on the client via next/dynamic (see ./index.tsx).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";
import type { DistrictProps, DistrictsGeo } from "@/lib/types";

export interface ChoroplethProps {
  geo: DistrictsGeo;
  /** Fill colour, or null when the district has no data (drawn as a dashed outline only) */
  fill: (d: DistrictProps) => string | null;
  tooltip: (d: DistrictProps) => string;
  onSelect?: (district: string) => void;
  selected?: string | null;
  /** Changes whenever fill/tooltip change, so the layer re-renders */
  styleKey: string;
  height?: number;
  edge: string;
  highlight: string;
  noDataEdge: string;
}

function FitBounds({ geo }: { geo: DistrictsGeo }) {
  const map = useMap();
  useEffect(() => {
    const b = L.geoJSON(geo as GeoJSON.FeatureCollection).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [8, 8] });
  }, [geo, map]);
  return null;
}

export default function ChoroplethMap({ geo, fill, tooltip, onSelect, selected, styleKey, height = 480, edge, highlight, noDataEdge }: ChoroplethProps) {
  const key = useMemo(() => `${styleKey}|${selected ?? ""}`, [styleKey, selected]);
  return (
    <div style={{ height }} className="w-full">
      <MapContainer
        center={[22, 79]}
        zoom={6}
        zoomSnap={0.25}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <FitBounds geo={geo} />
        <GeoJSON
          key={key}
          data={geo as GeoJSON.FeatureCollection}
          style={(f) => {
            const d = f?.properties as DistrictProps;
            const isSel = selected === d.district;
            const c = fill(d);
            if (c == null) {
              return { fillOpacity: 0, color: isSel ? highlight : noDataEdge, weight: isSel ? 3 : 1, dashArray: "3 3" };
            }
            return { fillColor: c, fillOpacity: 1, color: isSel ? highlight : edge, weight: isSel ? 3 : 1 };
          }}
          onEachFeature={(f, layer) => {
            const d = f.properties as DistrictProps;
            layer.bindTooltip(tooltip(d), { sticky: true, className: "kr-tip", direction: "top", offset: [0, -8] });
            layer.on({
              mouseover: (e) => (e.target as L.Path).setStyle({ weight: 3, color: highlight }),
              mouseout: (e) => {
                if (selected !== d.district) (e.target as L.Path).setStyle({ weight: 1, color: fill(d) == null ? noDataEdge : edge });
              },
              click: () => onSelect?.(d.district),
            });
          }}
        />
      </MapContainer>
    </div>
  );
}
