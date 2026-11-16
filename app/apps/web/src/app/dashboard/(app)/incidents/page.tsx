"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { defaultFilters, Filters, filtersToQuery, type FilterState } from "@/components/dashboard/Filters";
import { PageHeader } from "@/components/dashboard/Shell";
import { useStaff } from "@/components/dashboard/session";
import { Button, Empty, ErrorText, Input, Label, Modal, PriorityBadge, Select, StatusBadge, Textarea } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface Row {
  id: string; control_number: string; status: never; priority: never; category_name: string; color: string; source: string;
  barangay: string | null; unit: string | null; description: string; created_at: string;
}

export default function IncidentsPage() {
  const { can } = useStaff();
  const [filters, setFilters] = useState<FilterState>(() => ({ ...defaultFilters(), status: [] }));
  const qs = filtersToQuery(useDeferredValue(filters), 1000);
  const { data, isFetching } = useQuery({ queryKey: ["incidents", qs], queryFn: () => api<{ incidents: Row[] }>(`/api/incidents?${qs}`), placeholderData: (p) => p });
  const [walkIn, setWalkIn] = useState(false);
  const rows = data?.incidents ?? [];
  return (
    <div className="pb-10">
      <PageHeader title="Incidents" subtitle={isFetching ? "Updating…" : `${rows.length} matching`}
        actions={can("incident.create_walkin") && <Button onClick={() => setWalkIn(true)}>Log walk-in / phone report</Button>} />
      <div className="px-6"><Filters value={filters} onChange={setFilters} /></div>
      <div className="mt-4 overflow-x-auto px-6">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-2">Control no.</th><th>Category</th><th>Barangay</th><th>Source</th><th>Status</th><th>Unit</th><th>Reported</th></tr>
          </thead>
          <tbody className="divide-y bg-white">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="py-2 pl-2"><Link href={`/dashboard/incidents/${r.id}`} className="font-mono font-semibold text-navy-700 hover:underline">{r.control_number}</Link> <PriorityBadge priority={r.priority} /></td>
                <td><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />{r.category_name}</td>
                <td>{r.barangay ?? "—"}</td>
                <td className="capitalize">{r.source.replace("_", "-")}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className="text-xs text-slate-600">{r.unit ?? "—"}</td>
                <td className="text-xs text-slate-600">{fmtDateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !isFetching && <Empty>No incidents match these filters.</Empty>}
      </div>
      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} />
    </div>
  );
}

function WalkInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: { code: string; name_en: string; module: string }[] }>("/api/public/categories") });
  const brgys = useQuery({ queryKey: ["barangays", false], queryFn: () => api<{ barangays: { id: string; name: string; lat: number; lng: number }[] }>("/api/public/barangays") });
  const [f, setF] = useState({ categoryCode: "", barangay: "", description: "", lat: "", lng: "", people: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  async function submit() {
    setErr("");
    const b = brgys.data?.barangays.find((x) => x.id === f.barangay);
    const lat = f.lat ? Number(f.lat) : b?.lat;
    const lng = f.lng ? Number(f.lng) : b?.lng;
    if (!lat || !lng) return setErr("Pick a barangay or enter coordinates");
    try {
      const r = await api<{ controlNumber: string }>("/api/incidents", {
        body: {
          clientId: crypto.randomUUID(), categoryCode: f.categoryCode, description: f.description,
          location: { lat, lng }, locationSource: f.lat ? "manual" : "device", peopleAffected: f.people ? Number(f.people) : undefined,
          addressText: b ? `${b.name} (barangay centre)` : undefined,
        },
      });
      setDone(r.controlNumber);
      void qc.invalidateQueries({ queryKey: ["incidents"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <Modal open={open} onClose={() => { setDone(""); onClose(); }} title="Log walk-in / phone report">
      {done ? (
        <div className="space-y-3 text-center"><p>Report logged.</p><p className="font-mono text-lg font-bold">{done}</p><Button onClick={() => { setDone(""); onClose(); }}>Close</Button></div>
      ) : (
        <div className="space-y-3">
          <div><Label>Category</Label><Select value={f.categoryCode} onChange={(e) => setF({ ...f, categoryCode: e.target.value })}>
            <option value="">Select…</option>{cats.data?.categories.map((c) => <option key={c.code} value={c.code}>{c.name_en} ({c.module})</option>)}</Select></div>
          <div><Label>Barangay</Label><Select value={f.barangay} onChange={(e) => setF({ ...f, barangay: e.target.value })}>
            <option value="">Select…</option>{brgys.data?.barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label hint="optional">Latitude</Label><Input value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></div>
            <div><Label hint="optional">Longitude</Label><Input value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} /></div>
            <div><Label hint="optional">People</Label><Input type="number" value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} /></div>
          </div>
          <div><Label>Description</Label><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <ErrorText>{err}</ErrorText>
          <Button className="w-full" disabled={!f.categoryCode} onClick={submit}>Create report</Button>
        </div>
      )}
    </Modal>
  );
}
