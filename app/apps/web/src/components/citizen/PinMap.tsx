"use client";

import { NAVOTAS_CENTER } from "@navopulse/shared";
import type * as Leaflet from "leaflet";
import { useEffect, useRef } from "react";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Small map with a draggable pin, for confirming or correcting a report location. */
export default function PinMap({ value, onChange, height = 220 }: { value: { lat: number; lng: number } | null; onChange?: (p: { lat: number; lng: number }) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const start = value ?? NAVOTAS_CENTER;
      map.current = L.map(el.current, { zoomControl: false, attributionControl: false }).setView([start.lat, start.lng], 17);
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map.current);
      marker.current = L.marker([start.lat, start.lng], {
        draggable: !!cb.current,
        icon: L.divIcon({ className: "", html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#dc2626;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,.4)"></div>`, iconSize: [26, 26], iconAnchor: [13, 26] }),
      }).addTo(map.current);
      marker.current.on("dragend", () => {
        const p = marker.current!.getLatLng();
        cb.current?.({ lat: p.lat, lng: p.lng });
      });
      map.current.on("click", (e: Leaflet.LeafletMouseEvent) => {
        if (!cb.current) return;
        marker.current?.setLatLng(e.latlng);
        cb.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!value || !marker.current || !map.current) return;
    const cur = marker.current.getLatLng();
    if (Math.abs(cur.lat - value.lat) > 1e-7 || Math.abs(cur.lng - value.lng) > 1e-7) {
      marker.current.setLatLng([value.lat, value.lng]);
      map.current.setView([value.lat, value.lng], map.current.getZoom());
    }
  }, [value]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-2xl ring-1 ring-slate-200" />;
}
