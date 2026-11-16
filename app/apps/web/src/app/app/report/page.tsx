"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, LocateFixed } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { PhotoPicker, useGeolocation } from "@/components/citizen/hooks";
import { cx } from "@/components/ui";
import { api } from "@/lib/client";
import { NetworkError, queue, sendReport, type QueuedPhoto, type QueuedReport } from "@/lib/offlineQueue";

const PinMap = dynamic(() => import("@/components/citizen/PinMap"), { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-2xl bg-slate-200" /> });

interface Cat { code: string; name_en: string; name_fil: string; module: string; color: string }

export default function ReportPage() {
  const { t, lang, me } = useCitizen();
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Cat[] }>("/api/public/categories"), staleTime: Infinity });
  const geo = useGeolocation();
  const [cat, setCat] = useState<string | null>(null);
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [manualLoc, setManualLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | "queued" | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());

  // Photo EXIF GPS wins over device GPS (the photo shows where the problem is, not where you are now);
  // a pin the user moved by hand wins over both.
  const exifPhoto = photos.find((p) => p.exifLat !== null && p.exifLng !== null);
  const locSource: "device" | "exif" | "manual" = manualLoc ? "manual" : exifPhoto ? "exif" : "device";
  const loc = manualLoc ?? (exifPhoto ? { lat: exifPhoto.exifLat!, lng: exifPhoto.exifLng! } : geo.pos ? { lat: geo.pos.lat, lng: geo.pos.lng } : null);

  async function submit() {
    if (!cat || !loc) return;
    setBusy(true);
    setError("");
    const item: QueuedReport = {
      clientId, kind: "report", photos, createdAt: new Date().toISOString(), attempts: 0,
      body: {
        clientId, categoryCode: cat, description: desc, locationSource: locSource,
        location: { ...loc, ...(locSource === "device" && geo.pos ? { accuracy: geo.pos.accuracy } : {}) },
        observedAt: exifPhoto?.exifTakenAt ?? undefined,
      },
    };
    try {
      const r = await sendReport(item);
      setDone(r.controlNumber);
    } catch (e) {
      if (e instanceof NetworkError) {
        queue.add(item);
        setDone("queued");
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <Screen title={t("report")}>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">{t("guestNote")}</p>
          <Link href="/app/login?next=/app/report" className="mt-4 inline-block rounded-xl bg-navy-700 px-6 py-3 font-semibold text-white">{t("login")}</Link>
        </div>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen title={done === "queued" ? t("report") : t("submitted")} back={null}>
        <div className="space-y-3 rounded-2xl bg-white p-6 text-center shadow-sm">
          <CheckCircle2 className={cx("mx-auto", done === "queued" ? "text-amber-500" : "text-emerald-600")} size={52} />
          {done === "queued" ? <p className="text-sm">{t("offlineQueued")}</p> : (
            <>
              <div className="text-sm text-slate-500">{t("controlNumber")}</div>
              <div className="font-mono text-2xl font-bold">{done}</div>
              <p className="text-sm text-slate-600">{t("keepNumber")}</p>
            </>
          )}
          <div className="flex justify-center gap-3 pt-2">
            <Link href="/app/reports" className="rounded-xl bg-navy-700 px-4 py-2 text-sm font-semibold text-white">{t("myReports")}</Link>
            <button onClick={() => { setDone(null); setCat(null); setPhotos([]); setDesc(""); setManualLoc(null); setClientId(crypto.randomUUID()); }} className="rounded-xl bg-slate-100 px-4 py-2 text-sm">{t("report")}</button>
          </div>
        </div>
      </Screen>
    );
  }

  const groups = [
    { key: "traffic", label: "DisipliNavo" },
    { key: "civic", label: lang === "fil" ? "Komunidad" : "Community" },
  ];
  return (
    <Screen title={t("report")}>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">{g.label}</h2>
            <div className="flex flex-wrap gap-2">
              {cats.data?.categories.filter((c) => c.module === g.key).map((c) => (
                <button key={c.code} onClick={() => setCat(c.code)}
                  className={cx("rounded-full px-3 py-2 text-sm ring-1 transition", cat === c.code ? "bg-navy-700 text-white ring-navy-700" : "bg-white ring-slate-300")}>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {lang === "fil" ? c.name_fil : c.name_en}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">{t("addPhoto")}</h2>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">{t("location")}</h2>
            <button onClick={() => { setManualLoc(null); geo.refresh(); }} className="flex items-center gap-1 text-xs text-navy-700"><LocateFixed size={14} /> GPS</button>
          </div>
          <PinMap value={loc} onChange={setManualLoc} />
          <p className="mt-1 text-xs text-slate-500">
            {locSource === "exif" ? t("photoLocationUsed") : geo.loading ? t("locating") : !loc ? t("locationFailed") : lang === "fil" ? "I-drag ang pin kung mali ang lokasyon." : "Drag the pin if the location is wrong."}
          </p>
        </div>

        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={1000} placeholder={t("description")}
          className="w-full rounded-2xl border-0 bg-white p-4 text-base shadow-sm ring-1 ring-slate-200" />
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button disabled={!cat || !loc || busy} onClick={submit} className="w-full rounded-2xl bg-navy-700 py-4 text-lg font-bold text-white disabled:bg-navy-300">
          {busy ? t("sending") : t("submit")}
        </button>
      </div>
    </Screen>
  );
}
