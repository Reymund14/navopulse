"use client";

import { Camera, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { compressImage, readExif } from "@/lib/image";
import { fileToDataUrl, type QueuedPhoto } from "@/lib/offlineQueue";
import { useCitizen } from "./CitizenProvider";

export interface Geo {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Current device position with high accuracy; re-callable. */
export function useGeolocation() {
  const [pos, setPos] = useState<Geo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => {
        setError("unsupported");
        setLoading(false);
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e.message || "denied");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, []);
  useEffect(() => {
    request();
  }, [request]);
  const refresh = useCallback(() => {
    setLoading(true);
    request();
  }, [request]);
  return { pos, setPos, error, loading, refresh };
}

/** Photo picker: compresses on device and keeps EXIF GPS/time from the original. */
export function PhotoPicker({ photos, onChange, max = 3 }: { photos: QueuedPhoto[]; onChange: (p: QueuedPhoto[]) => void; max?: number }) {
  const { t } = useCitizen();
  const [busy, setBusy] = useState(false);
  async function add(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    const next = [...photos];
    for (const f of Array.from(files).slice(0, max - photos.length)) {
      const [exif, blob] = await Promise.all([readExif(f), compressImage(f)]);
      next.push({ dataUrl: await fileToDataUrl(blob), exifLat: exif.lat, exifLng: exif.lng, exifTakenAt: exif.takenAt });
    }
    onChange(next);
    setBusy(false);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <div key={i} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.dataUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
          {p.exifLat !== null && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">GPS</span>}
          <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow" aria-label="Remove"><X size={12} /></button>
        </div>
      ))}
      {photos.length < max && (
        <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white px-1 text-center text-[9px] leading-tight text-slate-500">
          <Camera size={20} />
          {busy ? "…" : t("addPhoto")}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => add(e.target.files)} multiple />
        </label>
      )}
    </div>
  );
}
