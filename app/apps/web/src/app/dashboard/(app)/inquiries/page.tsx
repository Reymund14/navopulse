"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/Shell";
import { Empty } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface Inquiry { id: string; control_number: string; topic: string; status: string; created_at: string; incident_id: string | null; incident_control_number: string | null; transcript_ref: string | null }

export default function InquiriesPage() {
  const { data } = useQuery({ queryKey: ["inquiries"], queryFn: () => api<{ inquiries: Inquiry[] }>("/api/inquiries") });
  return (
    <div className="pb-10">
      <PageHeader title="NavoBot tickets" subtitle="Conversations NavoBot logged for follow-up, and the incidents created from them" />
      <div className="overflow-x-auto px-6">
        <table className="w-full min-w-[800px] bg-white text-sm">
          <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Inquiry no.</th><th>Topic</th><th>Status</th><th>Incident</th><th>Transcript</th><th>Received</th></tr></thead>
          <tbody className="divide-y">
            {data?.inquiries.map((q) => (
              <tr key={q.id}>
                <td className="p-2 font-mono text-xs">{q.control_number}</td>
                <td>{q.topic}</td>
                <td className="capitalize">{q.status}</td>
                <td>{q.incident_id ? <Link className="font-mono text-xs text-navy-700 underline" href={`/dashboard/incidents/${q.incident_id}`}>{q.incident_control_number}</Link> : "—"}</td>
                <td>{q.transcript_ref ? <a className="text-xs text-navy-700 underline" href={q.transcript_ref} target="_blank" rel="noreferrer">Open</a> : "—"}</td>
                <td className="text-xs text-slate-500">{fmtDateTime(q.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.inquiries.length && <Empty>No NavoBot tickets yet.</Empty>}
      </div>
    </div>
  );
}
