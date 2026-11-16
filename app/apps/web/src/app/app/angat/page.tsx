"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Store } from "lucide-react";
import { useState } from "react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { cx } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface Content {
  announcements: { id: string; title_en: string; title_fil: string; body_en: string; body_fil: string; published_at: string }[];
  events: { id: string; title: string; description: string; venue: string | null; starts_at: string; barangay: string | null }[];
  businesses: { id: string; name: string; category: string; description: string; address: string | null; contact: string | null; barangay: string | null }[];
}

export default function Angat() {
  const { t, lang } = useCitizen();
  const { data } = useQuery({ queryKey: ["content"], queryFn: () => api<Content>("/api/public/content") });
  const [tab, setTab] = useState<"announcements" | "events" | "businesses">("announcements");
  return (
    <Screen title={t("angat")}>
      <div className="mb-4 flex gap-2">
        {(["announcements", "events", "businesses"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cx("flex-1 rounded-full py-2 text-xs font-medium ring-1", tab === k ? "bg-navy-700 text-white ring-navy-700" : "bg-white ring-slate-300")}>{t(k)}</button>
        ))}
      </div>
      <div className="space-y-3">
        {tab === "announcements" && data?.announcements.map((a) => (
          <article key={a.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold">{lang === "fil" ? a.title_fil : a.title_en}</h2>
            <p className="mt-1 text-sm text-slate-700">{lang === "fil" ? a.body_fil : a.body_en}</p>
            <div className="mt-2 text-xs text-slate-400">{fmtDateTime(a.published_at)}</div>
          </article>
        ))}
        {tab === "events" && data?.events.map((e) => (
          <article key={e.id} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <CalendarDays className="shrink-0 text-rose-500" />
            <div>
              <h2 className="font-semibold">{e.title}</h2>
              <div className="text-xs text-slate-500">{fmtDateTime(e.starts_at)} · {e.venue}{e.barangay ? `, ${e.barangay}` : ""}</div>
              <p className="mt-1 text-sm text-slate-700">{e.description}</p>
            </div>
          </article>
        ))}
        {tab === "businesses" && data?.businesses.map((b) => (
          <article key={b.id} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <Store className="shrink-0 text-sea-600" />
            <div>
              <h2 className="font-semibold">{b.name}</h2>
              <div className="text-xs text-slate-500">{b.category} · {b.barangay}</div>
              <p className="mt-1 text-sm text-slate-700">{b.description}</p>
              {b.contact && <div className="mt-1 text-xs text-slate-500">{b.contact}</div>}
            </div>
          </article>
        ))}
      </div>
    </Screen>
  );
}
