"use client";

import { ROLE_LABELS, ROLES, type Role } from "@navopulse/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/Shell";
import { Button, ErrorText, Input, Label, Modal, Select } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

interface U { id: string; full_name: string | null; email: string | null; role: Role; is_active: boolean; last_login_at: string | null; unit: string | null; has_mobile: boolean }

export default function UsersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: U[] }>("/api/admin/users") });
  const units = useQuery({ queryKey: ["units"], queryFn: () => api<{ units: { id: string; name: string }[] }>("/api/units") });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  async function patch(id: string, body: object) {
    setErr("");
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body });
      void qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) { setErr((e as Error).message); }
  }
  const staff = data?.users.filter((u) => u.role !== "citizen") ?? [];
  const citizens = data?.users.filter((u) => u.role === "citizen") ?? [];
  return (
    <div className="pb-10">
      <PageHeader title="Users and roles" subtitle={`${staff.length} staff · ${citizens.length} registered residents`} actions={<Button onClick={() => setAdding(true)}>Add staff account</Button>} />
      <div className="px-6"><ErrorText>{err}</ErrorText></div>
      <div className="overflow-x-auto px-6">
        <table className="w-full min-w-[900px] bg-white text-sm">
          <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Name</th><th>Email / login</th><th>Role</th><th>Unit</th><th>Last sign-in</th><th>Active</th></tr></thead>
          <tbody className="divide-y">
            {[...staff, ...citizens].map((u) => (
              <tr key={u.id}>
                <td className="p-2">{u.full_name ?? "—"}</td>
                <td className="text-xs">{u.email ?? (u.has_mobile ? "Mobile OTP" : "—")}</td>
                <td>
                  {u.role === "citizen" ? <span className="text-xs">Citizen</span> : (
                    <select className="rounded border border-slate-300 px-1 py-0.5 text-xs" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                      {ROLES.filter((r) => r !== "citizen").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  )}
                </td>
                <td className="text-xs">
                  {u.role === "field_responder" ? (
                    <select className="rounded border border-slate-300 px-1 py-0.5 text-xs" value={units.data?.units.find((x) => x.name === u.unit)?.id ?? ""} onChange={(e) => patch(u.id, { unitId: e.target.value || null })}>
                      <option value="">—</option>{units.data?.units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  ) : u.unit ?? ""}
                </td>
                <td className="text-xs text-slate-500">{fmtDateTime(u.last_login_at)}</td>
                <td><input type="checkbox" checked={u.is_active} onChange={(e) => patch(u.id, { isActive: e.target.checked })} aria-label="Active" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddStaff open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function AddStaff({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ fullName: "", email: "", role: "drrmo_dispatcher", password: "" });
  const [err, setErr] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Add staff account">
      <div className="space-y-3">
        <div><Label>Full name</Label><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
        <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><Label>Role</Label><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.filter((r) => r !== "citizen").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></div>
        <div><Label hint="min 10 characters">Temporary password</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <ErrorText>{err}</ErrorText>
        <Button className="w-full" onClick={async () => {
          try {
            await api("/api/admin/users", { body: { ...f, isActive: true } });
            void qc.invalidateQueries({ queryKey: ["users"] });
            onClose();
          } catch (e) { setErr((e as Error).message); }
        }}>Create</Button>
      </div>
    </Modal>
  );
}
