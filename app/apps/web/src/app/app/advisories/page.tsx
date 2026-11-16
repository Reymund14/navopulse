"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { cx } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface A { id: string; title: string; body_en: string; body_fil: string; severity: string; sent_at: string; barangays: string[] }

const SEV: Record<string, string> = { critical: "bg-red-600 text-white", warning: "bg-orange-100 text-orange-950 ring-1 ring-orange-200", advisory: "bg-amber-50 text-amber-950 ring-1 ring-amber-200", info: "bg-sky-50 text-sky-950 ring-1 ring-sky-200" };

export default function Advisories() {
  const { t, lang, me } = useCitizen();
  const { data } = useQuery({ queryKey: ["advisories", me?.barangayId], queryFn: () => api<{ advisories: A[] }>(`/api/public/advisories${me?.barangayId ? `?barangayId=${me.barangayId}` : ""}`), refetchInterval: 60_000 });
  return (
    <Screen title={t("advisories")}>
      <div className="space-y-3">
        {data?.advisories.length === 0 && <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500">{t("noAdvisories")}</div>}
        {data?.advisories.map((a) => (
          <article key={a.id} className={cx("rounded-2xl p-4 shadow-sm", SEV[a.severity])}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide"><AlertTriangle size={14} /> {a.severity}</div>
            <h2 className="mt-1 font-semibold">{a.title}</h2>
            <p className="mt-1 text-sm">{lang === "fil" ? a.body_fil : a.body_en}</p>
            <div className="mt-2 text-xs opacity-75">{fmtDateTime(a.sent_at)} · {a.barangays.length ? a.barangays.join(", ") : lang === "fil" ? "Buong lungsod" : "City-wide"}</div>
          </article>
        ))}
      </div>
    </Screen>
  );
}
