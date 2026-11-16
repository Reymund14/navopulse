"use client";

import { NAVOTAS_CENTER, type IncidentStatus } from "@navopulse/shared";
import type * as Leaflet from "leaflet";
import { useEffect, useRef } from "react";

export interface MapIncident {
  id: string;
  control_number: string;
  status: IncidentStatus;
  priority: string;
  module: string;
  category_name: string;
  color: string;
  lat: number;
  lng: number;
  created_at: string;
  barangay: string | null;
}

export interface MapUnit {
  id: string;
  name: string;
  office: string;
  is_available: boolean;
  lat: number | null;
  lng: number | null;
}

interface Props {
  incidents: MapIncident[];
  barangays?: { name: string; boundary: GeoJSON.Geometry | null }[];
  units?: MapUnit[];
  layers: { pins: boolean; heat: boolean; boundaries: boolean; units: boolean };
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  highlightIds?: Set<string>;
}

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CLOSED = new Set(["resolved", "rejected", "duplicate"]);

/**
 * Leaflet map with marker clustering (canvas circle markers, chunked loading,
 * comfortably handles 5,000+ pins), a heatmap layer, barangay boundaries and
 * unit positions. Leaflet touches `window`, so everything loads in effects.
 */
export default function IncidentMap({ incidents, barangays, units, layers, selectedId, onSelect, highlightIds }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const groups = useRef<{ cluster?: Leaflet.LayerGroup; heat?: Leaflet.Layer; bounds?: Leaflet.GeoJSON; units?: Leaflet.LayerGroup; selected?: Leaflet.Layer }>({});
  const ready = useRef<Promise<void> | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    ready.current = (async () => {
      const leaflet = (await import("leaflet")).default;
      (window as unknown as { L: typeof Leaflet }).L = leaflet;
      await import("leaflet.markercluster");
      await import("leaflet.heat");
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      map.current = leaflet.map(el.current, { preferCanvas: true, zoomControl: true }).setView([NAVOTAS_CENTER.lat, NAVOTAS_CENTER.lng], 14);
      leaflet.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map.current);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Incident pins + heat
  useEffect(() => {
    void ready.current?.then(() => {
      const m = map.current;
      const lf = L.current;
      if (!m || !lf) return;
      groups.current.cluster?.remove();
      groups.current.heat?.remove();
      const renderer = lf.canvas({ padding: 0.5 });
      const cluster = (lf as unknown as { markerClusterGroup: (o: object) => Leaflet.LayerGroup }).markerClusterGroup({
        chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 45, disableClusteringAtZoom: 18,
      });
      const markers = incidents.map((i) => {
        const open = !CLOSED.has(i.status);
        const hl = highlightIds?.has(i.id);
        const mk = lf.circleMarker([i.lat, i.lng], {
          renderer, radius: i.priority === "critical" && open ? 9 : open ? 7 : 5,
          color: hl ? "#dc2626" : "#ffffff", weight: hl ? 3 : 1.5, fillColor: i.color, fillOpacity: open ? 0.95 : 0.35,
        });
        mk.bindTooltip(`<b>${i.control_number}</b><br>${i.category_name}<br>${i.barangay ?? ""} · ${i.status.replace("_", " ")}`, { direction: "top" });
        mk.on("click", () => onSelectRef.current?.(i.id));
        return mk;
      });
      (cluster as unknown as { addLayers: (l: Leaflet.Layer[]) => void }).addLayers(markers);
      groups.current.cluster = cluster;
      if (layers.pins) cluster.addTo(m);

      const heat = (lf as unknown as { heatLayer: (pts: [number, number, number][], o: object) => Leaflet.Layer }).heatLayer(
        incidents.map((i) => [i.lat, i.lng, i.module === "emergency" ? 1 : 0.5]),
        { radius: 22, blur: 18, maxZoom: 16, minOpacity: 0.3 },
      );
      groups.current.heat = heat;
      if (layers.heat) heat.addTo(m);
    });
  }, [incidents, layers.pins, layers.heat, highlightIds]);

  // Barangay boundaries
  useEffect(() => {
    void ready.current?.then(() => {
      const m = map.current;
      const lf = L.current;
      if (!m || !lf) return;
      groups.current.bounds?.remove();
      if (!layers.boundaries || !barangays) return;
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: barangays.filter((b) => b.boundary).map((b) => ({ type: "Feature", properties: { name: b.name }, geometry: b.boundary! })),
      };
      groups.current.bounds = lf.geoJSON(fc, {
        style: { color: "#1f416a", weight: 1.5, fillOpacity: 0.04, dashArray: "4 3" },
        onEachFeature: (f, layer) => layer.bindTooltip(String(f.properties?.name ?? ""), { sticky: true, className: "text-xs" }),
        interactive: true,
      }).addTo(m);
      groups.current.bounds.bringToBack();
    });
  }, [barangays, layers.boundaries]);

  // Units
  useEffect(() => {
    void ready.current?.then(() => {
      const m = map.current;
      const lf = L.current;
      if (!m || !lf) return;
      groups.current.units?.remove();
      if (!layers.units || !units) return;
      const g = lf.layerGroup();
      for (const u of units) {
        if (u.lat === null || u.lng === null) continue;
        lf.marker([u.lat, u.lng], {
          icon: lf.divIcon({
            className: "",
            html: `<div style="background:${u.is_available ? "#0d9488" : "#64748b"};color:white;font-size:10px;font-weight:700;padding:2px 5px;border-radius:6px;border:2px solid white;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4)">${u.office} · ${u.name.replace(/^(DRRMO|TMO) /, "")}</div>`,
            iconAnchor: [10, 10],
          }),
        }).bindTooltip(`${u.name} · ${u.is_available ? "available" : "deployed"}`).addTo(g);
      }
      g.addTo(m);
      groups.current.units = g;
    });
  }, [units, layers.units]);

  // Selected incident: pulse ring + pan
  useEffect(() => {
    void ready.current?.then(() => {
      const m = map.current;
      const lf = L.current;
      if (!m || !lf) return;
      groups.current.selected?.remove();
      const i = incidents.find((x) => x.id === selectedId);
      if (!i) return;
      groups.current.selected = lf.marker([i.lat, i.lng], {
        icon: lf.divIcon({ className: "", html: `<div class="np-pulse" style="width:22px;height:22px;border-radius:9999px;border:3px solid #dc2626;background:rgba(220,38,38,.15)"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        interactive: false,
      }).addTo(m);
      if (!m.getBounds().pad(-0.2).contains([i.lat, i.lng])) m.panTo([i.lat, i.lng]);
    });
  }, [selectedId, incidents]);

  return <div ref={el} className="h-full w-full" />;
}
