"use client";

import { STATUS_LABELS, type IncidentStatus } from "@navopulse/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { use, useState } from "react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { cx, StatusBadge } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface Detail {
  id: string; control_number: string; status: IncidentStatus; name_en: string; name_fil: string; description: string; created_at: string;
  resolution_note: string | null; barangay: string | null; duplicate_of_control_number: string | null; rating: number | null; comment: string | null;
  history: { to_status: IncidentStatus; created_at: string }[]; media: { id: string; type: "report" | "resolution" }[];
}

export default function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useCitizen();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["my-report", id], queryFn: () => api<{ incident: Detail }>(`/api/me/incidents/${id}`) });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  if (error) return <Screen title={t("myReports")} back="/app/reports"><p className="text-sm text-red-600">{(error as Error).message}</p></Screen>;
  if (!data) return <Screen title="…" back="/app/reports"><div /></Screen>;
  const r = data.incident;

  async function rate() {
    await api(`/api/me/incidents/${id}/feedback`, { body: { rating, comment: comment || undefined } });
    setSent(true);
    void qc.invalidateQueries({ queryKey: ["my-reports"] });
    void qc.invalidateQueries({ queryKey: ["my-report", id] });
  }

  return (
    <Screen title={lang === "fil" ? r.name_fil : r.name_en} back="/app/reports">
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">{t("controlNumber")}</div>
          <div className="font-mono text-lg font-bold">{r.control_number}</div>
          <div className="mt-2"><StatusBadge status={r.status} lang={lang} /></div>
          {r.description && <p className="mt-3 text-sm text-slate-700">{r.description}</p>}
          <div className="mt-2 text-xs text-slate-500">{fmtDateTime(r.created_at)}{r.barangay ? ` · ${r.barangay}` : ""}</div>
          {r.duplicate_of_control_number && <p className="mt-2 text-sm text-slate-600">{lang === "fil" ? "Sinusubaybayan sa ilalim ng" : "Tracked under"} <b className="font-mono">{r.duplicate_of_control_number}</b></p>}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("history")}</h2>
          <ol className="space-y-3 border-l-2 border-navy-100 pl-4">
            {r.history.map((h, i) => (
              <li key={i} className="relative">
                <span className={cx("absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-2 ring-white", i === r.history.length - 1 ? "bg-navy-600" : "bg-navy-200")} />
                <div className="text-sm font-medium">{STATUS_LABELS[h.to_status][lang]}</div>
                <div className="text-xs text-slate-500">{fmtDateTime(h.created_at)}</div>
              </li>
            ))}
          </ol>
        </div>

        {r.media.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {r.media.map((m) => (
              <div key={m.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${m.id}`} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                {m.type === "resolution" && <span className="absolute bottom-1 left-1 rounded bg-emerald-600 px-1 text-[10px] text-white">{t("resolutionPhoto")}</span>}
              </div>
            ))}
          </div>
        )}

        {r.resolution_note && <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">{r.resolution_note}</div>}

        {r.status === "resolved" && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            {r.rating && !sent ? (
              <div className="flex items-center gap-1 text-sm">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={18} className={i < r.rating! ? "fill-amber-400 text-amber-400" : "text-slate-300"} />)}<span className="ml-2 text-slate-500">{t("thanksFeedback")}</span></div>
            ) : sent ? (
              <p className="text-center font-medium text-emerald-700">{t("thanksFeedback")}</p>
            ) : (
              <div className="space-y-3">
                <h2 className="font-semibold">{t("rateService")}</h2>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} aria-label={`${n}`}><Star size={36} className={n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"} /></button>
                  ))}
                </div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder={t("comment")} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
                <button disabled={!rating} onClick={rate} className="w-full rounded-xl bg-navy-700 py-3 font-semibold text-white disabled:bg-navy-300">{t("submit")}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Screen>
  );
}
