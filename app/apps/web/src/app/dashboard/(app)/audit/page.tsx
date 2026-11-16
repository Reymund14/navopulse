"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/Shell";
import { Select } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface Log { id: number; action: string; entity: string; entity_id: string | null; before: unknown; after: unknown; ip: string | null; created_at: string; actor: string | null; actor_role: string | null }

export default function AuditPage() {
  const [action, setAction] = useState("");
  const { data } = useQuery({ queryKey: ["audit", action], queryFn: () => api<{ logs: Log[] }>(`/api/audit${action ? `?action=${action}` : ""}`) });
  return (
    <div className="pb-10">
      <PageHeader title="Audit log" subtitle="Append-only record of administrative actions and personal-data access"
        actions={<div className="w-56"><Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option><option value="incident.">Incident actions</option><option value="pii.">Personal data access</option>
          <option value="auth.">Sign-ins</option><option value="advisory.">Broadcasts</option><option value="content.">Content</option><option value="user.">Users</option>
        </Select></div>} />
      <div className="overflow-x-auto px-6">
        <table className="w-full min-w-[900px] bg-white text-sm">
          <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Change</th><th>IP</th></tr></thead>
          <tbody className="divide-y">
            {data?.logs.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="p-2 text-xs text-slate-500">{fmtDateTime(l.created_at)}</td>
                <td className="text-xs">{l.actor ?? "—"}<div className="text-slate-400">{l.actor_role}</div></td>
                <td className="font-mono text-xs">{l.action}</td>
                <td className="text-xs">{l.entity}<div className="font-mono text-[10px] text-slate-400">{l.entity_id?.slice(0, 8)}</div></td>
                <td className="max-w-md text-[11px]"><code className="break-all text-slate-600">{l.after ? JSON.stringify(l.after).slice(0, 200) : ""}</code></td>
                <td className="font-mono text-xs">{l.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
