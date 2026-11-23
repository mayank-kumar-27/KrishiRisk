"use client";

// Leaflet choropleth without basemap tiles (the site makes no external requests).
// Loaded only on the client via next/dynamic (see ./index.tsx). The GeoJSON layer stays mounted;
// styles and tooltips are updated in place so colours transition smoothly between selections.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, type CSSProperties } from "react";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";
import type { DistrictProps, DistrictsGeo } from "@/lib/types";

export interface ChoroplethProps {
  geo: DistrictsGeo;
  /** Fill colour, or null when the district has no data (drawn as a dashed outline only) */
  fill: (d: DistrictProps) => string | null;
  tooltip: (d: DistrictProps) => string;
  onSelect?: (district: string) => void;
  selected?: string | null;
  /** Changes whenever fill/tooltip change, so the layer is restyled */
  styleKey: string;
  height?: number;
  edge: string;
  highlight: string;
  noDataEdge: string;
}

type FeatureLayer = L.Path & { feature: GeoJSON.Feature };

function FitBounds({ geo }: { geo: DistrictsGeo }) {
  const map = useMap();
  useEffect(() => {
    const b = L.geoJSON(geo as GeoJSON.FeatureCollection).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [10, 10] });
  }, [geo, map]);
  return null;
}

export default function ChoroplethMap(props: ChoroplethProps) {
  const { geo, styleKey, selected, height = 480 } = props;
  const layerRef = useRef<L.GeoJSON | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const styleFor = (d: DistrictProps): L.PathOptions => {
    const p = latest.current;
    const isSel = p.selected === d.district;
    const c = p.fill(d);
    if (c == null) return { fillOpacity: 0, color: isSel ? p.highlight : p.noDataEdge, weight: isSel ? 3 : 1, dashArray: "3 3" };
    return { fillColor: c, fillOpacity: 1, color: isSel ? p.highlight : p.edge, weight: isSel ? 3 : 1.2, dashArray: undefined };
  };

  // Restyle + refresh tooltips in place whenever the colouring or selection changes
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.eachLayer((l) => {
      const fl = l as FeatureLayer;
      const d = fl.feature.properties as DistrictProps;
      fl.setStyle(styleFor(d));
      fl.setTooltipContent(latest.current.tooltip(d));
    }); // styleFor reads the latest props through a ref
  }, [styleKey, selected]);

  return (
    <div style={{ "--map-h": `${height}px` } as CSSProperties} className="kr-map-h w-full">
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
          ref={layerRef}
          data={geo as GeoJSON.FeatureCollection}
          style={(f) => styleFor(f?.properties as DistrictProps)}
          onEachFeature={(f, layer) => {
            const d = f.properties as DistrictProps;
            layer.bindTooltip(latest.current.tooltip(d), { sticky: true, className: "kr-tip", direction: "top", offset: [0, -10] });
            layer.on({
              mouseover: (e) => (e.target as L.Path).setStyle({ weight: 3, color: latest.current.highlight }),
              mouseout: (e) => (e.target as L.Path).setStyle(styleFor(d)),
              click: () => latest.current.onSelect?.(d.district),
            });
          }}
        />
      </MapContainer>
    </div>
  );
}
