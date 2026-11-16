"use client";

import { encodeSosSms, SOS_CATEGORY_CODE, type SosType } from "@navopulse/shared";
import { CheckCircle2, Flame, HeartPulse, LocateFixed, MessageSquareText, Phone, Waves, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { PhotoPicker, useGeolocation } from "@/components/citizen/hooks";
import { cx } from "@/components/ui";
import { NetworkError, queue, sendReport, smsHref, type QueuedPhoto, type QueuedReport } from "@/lib/offlineQueue";

const TYPES: { type: SosType; icon: typeof Waves; color: string }[] = [
  { type: "flood", icon: Waves, color: "bg-blue-600" },
  { type: "fire", icon: Flame, color: "bg-red-600" },
  { type: "medical", icon: HeartPulse, color: "bg-pink-600" },
  { type: "other", icon: TriangleAlert, color: "bg-orange-500" },
];

export default function SosPage() {
  const { t, me, config, lang } = useCitizen();
  const geo = useGeolocation();
  const [type, setType] = useState<SosType | null>(null);
  const [people, setPeople] = useState(1);
  const [desc, setDesc] = useState("");
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "sent"; controlNumber: string } | { kind: "queued"; clientId: string } | null>(null);
  const [error, setError] = useState("");
  const [clientId] = useState(() => crypto.randomUUID());

  const gateway = config?.smsGatewayNumber ?? "";
  const sms = type && geo.pos ? encodeSosSms({ type, lat: geo.pos.lat, lng: geo.pos.lng, peopleAffected: people, clientRef: clientId, note: desc }) : null;

  async function submit() {
    if (!type || !geo.pos) return;
    setBusy(true);
    setError("");
    const item: QueuedReport = {
      clientId, kind: "sos", photos, createdAt: new Date().toISOString(), attempts: 0,
      body: {
        clientId, categoryCode: SOS_CATEGORY_CODE[type], description: desc,
        location: { lat: geo.pos.lat, lng: geo.pos.lng, accuracy: geo.pos.accuracy },
        peopleAffected: people, locationSource: "device",
      },
    };
    try {
      const r = await sendReport(item);
      setResult({ kind: "sent", controlNumber: r.controlNumber });
    } catch (e) {
      if (e instanceof NetworkError) {
        queue.add(item);
        setResult({ kind: "queued", clientId });
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result?.kind === "sent") {
    return (
      <Screen title={t("submitted")} back={null}>
        <div className="space-y-4 rounded-2xl bg-white p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto text-emerald-600" size={56} />
          <div className="text-sm text-slate-500">{t("controlNumber")}</div>
          <div className="font-mono text-2xl font-bold text-navy-900">{result.controlNumber}</div>
          <p className="text-sm text-slate-600">{t("keepNumber")}</p>
          <p className="text-sm text-slate-600">{lang === "fil" ? "Nakarating na sa DRRMO ang iyong SOS. Manatili sa ligtas na lugar." : "Your SOS reached the DRRMO. Stay in a safe place."}</p>
          <a href={`tel:${config?.hotlines.national ?? "911"}`} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"><Phone size={16} /> {t("callHotline")}</a>
          <div><Link href="/app/reports" className="text-sm font-semibold text-navy-700 underline">{t("myReports")}</Link></div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title={t("emergency")}>
      <div className="space-y-5">
        <a href={`tel:${config?.hotlines.national ?? "911"}`} className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 py-3 font-semibold text-white"><Phone size={18} /> {t("callHotline")}</a>

        <div>
          <h2 className="mb-2 font-semibold">{t("whatsHappening")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {TYPES.map(({ type: ty, icon: Icon, color }) => (
              <button key={ty} onClick={() => setType(ty)} className={cx("flex flex-col items-center gap-2 rounded-2xl p-4 font-semibold text-white shadow-sm transition", color, type && type !== ty && "opacity-40", type === ty && "ring-4 ring-navy-300")}>
                <Icon size={32} /> {t(ty)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
          <span className="font-medium">{t("peopleAffected")}</span>
          <div className="flex items-center gap-3">
            <button className="h-10 w-10 rounded-full bg-slate-100 text-xl" onClick={() => setPeople(Math.max(1, people - 1))} aria-label="-">−</button>
            <span className="w-8 text-center text-xl font-bold tabular-nums">{people}</span>
            <button className="h-10 w-10 rounded-full bg-slate-100 text-xl" onClick={() => setPeople(people + 1)} aria-label="+">+</button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">{t("location")}</span>
            <button onClick={geo.refresh} className="flex items-center gap-1 text-xs text-navy-700"><LocateFixed size={14} /> GPS</button>
          </div>
          <div className="text-sm text-slate-600">
            {geo.loading ? t("locating") : geo.pos ? `${geo.pos.lat.toFixed(5)}, ${geo.pos.lng.toFixed(5)} (±${Math.round(geo.pos.accuracy)} m)` : t("locationFailed")}
          </div>
        </div>

        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={500} placeholder={t("description")}
          className="w-full rounded-2xl border-0 bg-white p-4 text-base shadow-sm ring-1 ring-slate-200" />
        <PhotoPicker photos={photos} onChange={setPhotos} />

        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {result?.kind === "queued" && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">{t("offlineQueued")}</div>
        )}

        {me ? (
          <button disabled={!type || !geo.pos || busy} onClick={submit}
            className="w-full rounded-2xl bg-red-600 py-4 text-lg font-bold text-white shadow-lg disabled:bg-red-300">
            {busy ? t("sending") : `${t("sos")} — ${t("submit")}`}
          </button>
        ) : (
          <Link href="/app/login?next=/app/sos" className="block w-full rounded-2xl bg-navy-700 py-4 text-center text-lg font-bold text-white">{t("login")}</Link>
        )}

        {/* Offline SMS fallback works without data and without an account. */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-2 font-semibold"><MessageSquareText size={18} /> {t("smsFallback")}</div>
          <p className="mt-1 text-xs text-slate-500">{t("smsFallbackHint")}</p>
          {sms ? (
            <>
              <code className="mt-2 block break-all rounded-lg bg-slate-100 p-2 text-[11px]">{sms}</code>
              <a href={smsHref(gateway, sms)} className="mt-2 block rounded-xl bg-slate-800 py-3 text-center font-semibold text-white">{t("smsFallback")} → {gateway}</a>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">{lang === "fil" ? "Pumili ng uri ng emergency at hintayin ang GPS." : "Pick the emergency type and wait for GPS."}</p>
          )}
        </div>
      </div>
    </Screen>
  );
}
