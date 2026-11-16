"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/Shell";
import { useStaff } from "@/components/dashboard/session";
import { cx } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface Notif { id: string; channel: string; kind: string; status: string; error: string | null; created_at: string; title: string | null; body: string; control_number: string | null; advisory: string | null; recipient: string | null }
interface Sms { id: string; direction: string; phone: string; body: string; provider: string; status: string; parse_error: string | null; created_at: string; control_number: string | null }

export default function LogsPage() {
  const { can } = useStaff();
  const [tab, setTab] = useState<"notifications" | "sms">("notifications");
  const n = useQuery({ queryKey: ["notif-log"], queryFn: () => api<{ notifications: Notif[] }>("/api/notifications"), enabled: tab === "notifications", refetchInterval: 15_000 });
  const s = useQuery({ queryKey: ["sms-log"], queryFn: () => api<{ messages: Sms[] }>("/api/sms"), enabled: tab === "sms" && can("sms.read"), refetchInterval: 15_000 });
  return (
    <div className="pb-10">
      <PageHeader title="Notification log" subtitle="Every push, SMS and in-app message the system sent, and inbound SMS reports" />
      <div className="flex gap-2 px-6 pb-3">
        {(["notifications", ...(can("sms.read") ? ["sms"] : [])] as const).map((t) => (
          <button key={t} onClick={() => setTab(t as typeof tab)} className={cx("rounded-full px-3 py-1 text-sm ring-1", tab === t ? "bg-navy-700 text-white ring-navy-700" : "bg-white ring-slate-300")}>
            {t === "sms" ? "SMS gateway" : "Notifications"}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto px-6">
        {tab === "notifications" ? (
          <table className="w-full min-w-[900px] bg-white text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">When</th><th>Channel</th><th>Kind</th><th>Recipient</th><th>Message</th><th>Ref</th><th>Status</th></tr></thead>
            <tbody className="divide-y">
              {n.data?.notifications.map((r) => (
                <tr key={r.id}>
                  <td className="p-2 text-xs text-slate-500">{fmtDateTime(r.created_at)}</td>
                  <td className="uppercase text-xs">{r.channel}</td>
                  <td className="text-xs">{r.kind.replace("_", " ")}</td>
                  <td className="text-xs">{r.recipient ?? "(no account)"}</td>
                  <td className="max-w-md truncate text-xs" title={r.body}>{r.title ? <b>{r.title}: </b> : null}{r.body}</td>
                  <td className="font-mono text-xs">{r.control_number ?? r.advisory ?? ""}</td>
                  <td><span className={cx("rounded px-1.5 py-0.5 text-xs", r.status === "failed" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>{r.status}</span>{r.error && <div className="text-[10px] text-red-600">{r.error}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[900px] bg-white text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">When</th><th>Direction</th><th>Number</th><th>Body</th><th>Incident</th><th>Status</th></tr></thead>
            <tbody className="divide-y">
              {s.data?.messages.map((r) => (
                <tr key={r.id}>
                  <td className="p-2 text-xs text-slate-500">{fmtDateTime(r.created_at)}</td>
                  <td className="text-xs">{r.direction === "inbound" ? "⬇ in" : "⬆ out"} · {r.provider}</td>
                  <td className="font-mono text-xs">{r.phone}</td>
                  <td className="max-w-md truncate font-mono text-xs" title={r.body}>{r.body}</td>
                  <td className="font-mono text-xs">{r.control_number ?? ""}</td>
                  <td className="text-xs">{r.status}{r.parse_error && <div className="text-red-600">{r.parse_error}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
