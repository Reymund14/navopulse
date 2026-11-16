"use client";

import { ADVISORY_SEVERITIES } from "@navopulse/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useBarangays } from "@/components/dashboard/Filters";
import { PageHeader } from "@/components/dashboard/Shell";
import { Button, Card, cx, ErrorText, Input, Label, Select, Textarea } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface Advisory { id: string; title: string; body_en: string; severity: string; channels: string[]; sent_at: string; recipients_count: number; sent_by: string | null; barangays: string[] }

const SEV_COLOR: Record<string, string> = { info: "bg-sky-100 text-sky-800", advisory: "bg-amber-100 text-amber-800", warning: "bg-orange-100 text-orange-800", critical: "bg-red-600 text-white" };

export default function BroadcastsPage() {
  const qc = useQueryClient();
  const brgys = useBarangays();
  const list = useQuery({ queryKey: ["advisories"], queryFn: () => api<{ advisories: Advisory[] }>("/api/advisories") });
  const [f, setF] = useState({ title: "", bodyEn: "", bodyFil: "", severity: "advisory", barangayIds: [] as string[], push: true, sms: false });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const scope = f.barangayIds.length ? `${f.barangayIds.length} barangay(s)` : "ALL barangays";
    if (!window.confirm(`Send this ${f.severity.toUpperCase()} alert to ${scope} via ${[f.push && "push", f.sms && "SMS"].filter(Boolean).join(" + ")}?`)) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const r = await api<{ recipients: number }>("/api/advisories", {
        body: { title: f.title, bodyEn: f.bodyEn, bodyFil: f.bodyFil, severity: f.severity, barangayIds: f.barangayIds, channels: [f.push && "push", f.sms && "sms"].filter(Boolean) },
      });
      setOk(`Sent to ${r.recipients} registered resident(s).`);
      setF({ ...f, title: "", bodyEn: "", bodyFil: "" });
      void qc.invalidateQueries({ queryKey: ["advisories"] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader title="Broadcast alerts" subtitle="Send advisories to everyone or to selected barangays by push notification and SMS" />
      <div className="grid gap-6 px-6 lg:grid-cols-[1fr_1fr]">
        <Card title="New advisory">
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="High tide advisory" /></div>
            <div><Label>Message (English)</Label><Textarea rows={3} value={f.bodyEn} onChange={(e) => setF({ ...f, bodyEn: e.target.value })} /></div>
            <div><Label>Mensahe (Filipino)</Label><Textarea rows={3} value={f.bodyFil} onChange={(e) => setF({ ...f, bodyFil: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Severity</Label><Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{ADVISORY_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
              <div><Label>Channels</Label>
                <div className="flex gap-4 pt-2 text-sm">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.push} onChange={(e) => setF({ ...f, push: e.target.checked })} /> Push</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.sms} onChange={(e) => setF({ ...f, sms: e.target.checked })} /> SMS</label>
                </div>
              </div>
            </div>
            <div>
              <Label hint="leave empty for city-wide">Target barangays</Label>
              <div className="flex flex-wrap gap-1.5">
                {brgys.data?.barangays.map((b) => {
                  const on = f.barangayIds.includes(b.id);
                  return (
                    <button key={b.id} type="button" onClick={() => setF({ ...f, barangayIds: on ? f.barangayIds.filter((x) => x !== b.id) : [...f.barangayIds, b.id] })}
                      className={cx("rounded-full px-2.5 py-1 text-xs ring-1", on ? "bg-navy-700 text-white ring-navy-700" : "bg-white text-slate-600 ring-slate-300")}>{b.name}</button>
                  );
                })}
              </div>
            </div>
            <ErrorText>{err}</ErrorText>
            {ok && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</div>}
            <Button variant={f.severity === "critical" ? "danger" : "primary"} className="w-full" disabled={busy || !f.title || !f.bodyEn || !f.bodyFil || (!f.push && !f.sms)} onClick={send}>
              {busy ? "Sending…" : "Send advisory"}
            </Button>
            <p className="text-xs text-slate-500">Critical alerts also fall back to SMS for residents without a registered device.</p>
          </div>
        </Card>
        <Card title="Sent advisories">
          <ul className="divide-y">
            {list.data?.advisories.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex items-center gap-2">
                  <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", SEV_COLOR[a.severity])}>{a.severity}</span>
                  <span className="font-medium">{a.title}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{a.body_en}</p>
                <div className="mt-1 text-xs text-slate-500">
                  {fmtDateTime(a.sent_at)} · {a.sent_by ?? "—"} · {a.channels.join(" + ")} · {a.barangays.length ? a.barangays.join(", ") : "City-wide"} · {a.recipients_count} recipients
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
