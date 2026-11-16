"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/Shell";
import { useStaff } from "@/components/dashboard/session";
import { Button, Card, ErrorText, Input, Label, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";

interface Unit { id: string; name: string; office: string; type: string; contact: string | null; is_available: boolean; active_incidents: number }

export default function UnitsPage() {
  const { can, user } = useStaff();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["units"], queryFn: () => api<{ units: Unit[] }>("/api/units") });
  const toggle = useMutation({
    mutationFn: (u: Unit) => api(`/api/units/${u.id}`, { method: "PATCH", body: { isAvailable: !u.is_available } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
  const [adding, setAdding] = useState(false);
  return (
    <div className="pb-10">
      <PageHeader title="Field crews" subtitle="Response units, availability and current load" actions={can("units.manage") && <Button onClick={() => setAdding(true)}>Add unit</Button>} />
      <div className="grid gap-4 px-6 md:grid-cols-2 xl:grid-cols-3">
        {data?.units.map((u) => (
          <Card key={u.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{u.name}</div>
                <div className="text-xs text-slate-500">{u.office} · {u.type}{u.contact ? ` · ${u.contact}` : ""}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_available ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{u.is_available ? "Available" : "Deployed"}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span>{u.active_incidents} active incident{u.active_incidents === 1 ? "" : "s"}</span>
              {(can("units.manage") || user.unitId === u.id) && (
                <Button size="sm" variant="secondary" onClick={() => toggle.mutate(u)}>Mark {u.is_available ? "deployed" : "available"}</Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <AddUnit open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function AddUnit({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", office: "DRRMO", type: "", contact: "" });
  const [err, setErr] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Add response unit">
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Office</Label><Select value={f.office} onChange={(e) => setF({ ...f, office: e.target.value })}><option>DRRMO</option><option>TMO</option></Select></div>
          <div><Label>Type</Label><Input value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="Rescue boat" /></div>
        </div>
        <div><Label hint="optional">Contact / radio channel</Label><Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
        <ErrorText>{err}</ErrorText>
        <Button className="w-full" onClick={async () => {
          try {
            await api("/api/units", { body: { ...f, contact: f.contact || undefined } });
            void qc.invalidateQueries({ queryKey: ["units"] });
            onClose();
          } catch (e) { setErr((e as Error).message); }
        }}>Save</Button>
      </div>
    </Modal>
  );
}
