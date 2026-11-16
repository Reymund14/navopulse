"use client";

import type { IncidentStatus } from "@navopulse/shared";
import { useQuery } from "@tanstack/react-query";
import { Clock, Star } from "lucide-react";
import Link from "next/link";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { StatusBadge } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";
import { flushQueue, queue } from "@/lib/offlineQueue";

interface Mine { id: string; control_number: string; status: IncidentStatus; name_en: string; name_fil: string; created_at: string; description: string; barangay: string | null; rating: number | null }

export default function MyReports() {
  const { t, lang, me, meLoading, pending, online } = useCitizen();
  const { data, isLoading } = useQuery({ queryKey: ["my-reports"], queryFn: () => api<{ incidents: Mine[] }>("/api/me/incidents"), enabled: !!me, refetchInterval: 30_000 });
  if (!me && !meLoading) {
    return (
      <Screen title={t("myReports")} back={null}>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">{t("guestNote")}</p>
          <Link href="/app/login?next=/app/reports" className="mt-4 inline-block rounded-xl bg-navy-700 px-6 py-3 font-semibold text-white">{t("login")}</Link>
        </div>
      </Screen>
    );
  }
  return (
    <Screen title={t("myReports")} back={null}>
      <div className="space-y-3">
        {pending.map((p) => (
          <div key={p.clientId} className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><Clock size={16} /> {p.kind === "sos" ? "SOS" : t("report")} · {t("pendingSync")}</div>
            <div className="mt-1 text-xs text-amber-800">{fmtDateTime(p.createdAt)}{p.lastError ? ` · ${p.lastError}` : ""}</div>
            <div className="mt-2 flex gap-3 text-xs">
              <button disabled={!online} onClick={() => void flushQueue()} className="font-semibold text-navy-700 underline disabled:text-slate-400">{t("retry")}</button>
              <button onClick={() => queue.remove(p.clientId)} className="text-slate-500 underline">✕</button>
            </div>
          </div>
        ))}
        {isLoading && <div className="text-sm text-slate-500">…</div>}
        {data?.incidents.length === 0 && pending.length === 0 && <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500">{t("noReports")}</div>}
        {data?.incidents.map((r) => (
          <Link key={r.id} href={`/app/reports/${r.id}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-slate-500">{r.control_number}</span>
              <StatusBadge status={r.status} lang={lang} />
            </div>
            <div className="mt-1 font-semibold">{lang === "fil" ? r.name_fil : r.name_en}</div>
            {r.description && <div className="line-clamp-1 text-sm text-slate-600">{r.description}</div>}
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{fmtDateTime(r.created_at)}{r.barangay ? ` · ${r.barangay}` : ""}</span>
              {r.status === "resolved" && !r.rating && <span className="flex items-center gap-1 font-semibold text-amber-600"><Star size={12} /> {t("rateService")}</span>}
            </div>
          </Link>
        ))}
      </div>
    </Screen>
  );
}
