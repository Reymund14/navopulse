"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { api, fmtDateTime } from "@/lib/client";

interface N { id: string; payload: { title: string; body: string }; read_at: string | null; created_at: string; incident_id: string | null }

export default function Account() {
  const { t, me, lang, setLang, refreshMe } = useCitizen();
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: () => api<{ notifications: N[]; unread: number }>("/api/me/notifications"), enabled: !!me });
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    qc.clear();
    refreshMe();
  }
  return (
    <Screen title={t("account")} back={null}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          {me ? (
            <div className="flex items-center justify-between">
              <div><div className="font-semibold">{me.fullName ?? "—"}</div><div className="text-xs text-slate-500">Citizen</div></div>
              <button onClick={logout} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">{t("logout")}</button>
            </div>
          ) : (
            <Link href="/app/login?next=/app/account" className="block rounded-xl bg-navy-700 py-3 text-center font-semibold text-white">{t("login")}</Link>
          )}
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold">{t("language")}</div>
          <div className="flex gap-2">
            {(["fil", "en"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={`flex-1 rounded-xl py-2 text-sm ring-1 ${lang === l ? "bg-navy-700 text-white ring-navy-700" : "ring-slate-300"}`}>{l === "fil" ? "Filipino" : "English"}</button>
            ))}
          </div>
        </div>
        {me && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold"><Bell size={16} /> Inbox {inbox.data?.unread ? <span className="rounded-full bg-red-600 px-1.5 text-xs text-white">{inbox.data.unread}</span> : null}</div>
              {!!inbox.data?.unread && <button className="text-xs text-navy-700" onClick={async () => { await api("/api/me/notifications", { method: "POST" }); void inbox.refetch(); }}>Mark read</button>}
            </div>
            <ul className="divide-y">
              {inbox.data?.notifications.map((n) => (
                <li key={n.id} className={`py-2 text-sm ${n.read_at ? "text-slate-500" : ""}`}>
                  {n.incident_id ? <Link href={`/app/reports/${n.incident_id}`}><b>{n.payload.title}</b><div>{n.payload.body}</div></Link> : <><b>{n.payload.title}</b><div>{n.payload.body}</div></>}
                  <div className="text-xs text-slate-400">{fmtDateTime(n.created_at)}</div>
                </li>
              ))}
              {inbox.data?.notifications.length === 0 && <li className="py-2 text-sm text-slate-500">—</li>}
            </ul>
          </div>
        )}
        <Link href="/app/privacy" className="block text-center text-sm text-navy-700 underline">{t("privacyNotice")}</Link>
      </div>
    </Screen>
  );
}
