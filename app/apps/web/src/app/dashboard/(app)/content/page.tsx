"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useBarangays } from "@/components/dashboard/Filters";
import { PageHeader } from "@/components/dashboard/Shell";
import { Button, cx, ErrorText, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { api, fmtDateTime } from "@/lib/client";

type FieldKind = "text" | "textarea" | "bool" | "number" | "datetime" | "barangay" | "select" | "point" | "officials";
interface Field { key: string; label: string; kind: FieldKind; options?: string[]; col: string; required?: boolean }
interface TypeDef { label: string; fields: Field[]; columns: string[]; canCreate: boolean; canDelete: boolean }

const TYPES: Record<string, TypeDef> = {
  announcements: {
    label: "Announcements", canCreate: true, canDelete: true, columns: ["title_en", "is_published", "published_at"],
    fields: [
      { key: "titleEn", col: "title_en", label: "Title (English)", kind: "text", required: true },
      { key: "titleFil", col: "title_fil", label: "Pamagat (Filipino)", kind: "text", required: true },
      { key: "bodyEn", col: "body_en", label: "Body (English)", kind: "textarea", required: true },
      { key: "bodyFil", col: "body_fil", label: "Nilalaman (Filipino)", kind: "textarea", required: true },
      { key: "isPublished", col: "is_published", label: "Published", kind: "bool" },
    ],
  },
  events: {
    label: "Events", canCreate: true, canDelete: true, columns: ["title", "venue", "starts_at", "is_published"],
    fields: [
      { key: "title", col: "title", label: "Title", kind: "text", required: true },
      { key: "description", col: "description", label: "Description", kind: "textarea" },
      { key: "venue", col: "venue", label: "Venue", kind: "text" },
      { key: "barangayId", col: "barangay_id", label: "Barangay", kind: "barangay" },
      { key: "startsAt", col: "starts_at", label: "Starts", kind: "datetime", required: true },
      { key: "endsAt", col: "ends_at", label: "Ends", kind: "datetime" },
      { key: "isPublished", col: "is_published", label: "Published", kind: "bool" },
    ],
  },
  businesses: {
    label: "Local businesses", canCreate: true, canDelete: true, columns: ["name", "category", "address", "is_published"],
    fields: [
      { key: "name", col: "name", label: "Business name", kind: "text", required: true },
      { key: "category", col: "category", label: "Category", kind: "text", required: true },
      { key: "description", col: "description", label: "Description", kind: "textarea" },
      { key: "address", col: "address", label: "Address", kind: "text" },
      { key: "contact", col: "contact", label: "Contact", kind: "text" },
      { key: "barangayId", col: "barangay_id", label: "Barangay", kind: "barangay" },
      { key: "location", col: "location", label: "Map location (lat, lng)", kind: "point" },
      { key: "isPublished", col: "is_published", label: "Published", kind: "bool" },
    ],
  },
  transit_routes: {
    label: "Transit routes", canCreate: true, canDelete: true, columns: ["code", "name", "mode", "fare_min", "is_active"],
    fields: [
      { key: "code", col: "code", label: "Route code", kind: "text", required: true },
      { key: "name", col: "name", label: "Name", kind: "text", required: true },
      { key: "mode", col: "mode", label: "Mode", kind: "select", options: ["jeepney", "bus", "tricycle", "pedicab", "ferry", "uv_express"] },
      { key: "origin", col: "origin", label: "Origin", kind: "text", required: true },
      { key: "destination", col: "destination", label: "Destination", kind: "text", required: true },
      { key: "fareMin", col: "fare_min", label: "Minimum fare (₱)", kind: "number" },
      { key: "fareNotes", col: "fare_notes", label: "Fare notes", kind: "text" },
      { key: "description", col: "description", label: "Route guide", kind: "textarea" },
      { key: "isActive", col: "is_active", label: "Active", kind: "bool" },
    ],
  },
  barangays: {
    label: "Barangay directory", canCreate: false, canDelete: false, columns: ["name", "hotline", "address"],
    fields: [
      { key: "hotline", col: "hotline", label: "Hotline", kind: "text" },
      { key: "address", col: "address", label: "Barangay hall address", kind: "text" },
      { key: "population", col: "population", label: "Population", kind: "number" },
      { key: "officials", col: "officials", label: "Officials (one per line: Position | Name | Contact)", kind: "officials" },
    ],
  },
};

type Item = Record<string, unknown> & { id: string };

export default function ContentPage() {
  const [type, setType] = useState("announcements");
  const def = TYPES[type]!;
  const { data } = useQuery({ queryKey: ["content", type], queryFn: () => api<{ items: Item[] }>(`/api/admin/content/${type}`) });
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  return (
    <div className="pb-10">
      <PageHeader title="Content management" subtitle="What residents see in Angat Navotas, the Transport Hub and the Barangay Directory"
        actions={def.canCreate && <Button onClick={() => setEditing("new")}>New {def.label.toLowerCase().replace(/s$/, "")}</Button>} />
      <div className="flex flex-wrap gap-2 px-6 pb-3">
        {Object.entries(TYPES).map(([k, v]) => (
          <button key={k} onClick={() => setType(k)} className={cx("rounded-full px-3 py-1 text-sm ring-1", type === k ? "bg-navy-700 text-white ring-navy-700" : "bg-white ring-slate-300")}>{v.label}</button>
        ))}
      </div>
      <div className="overflow-x-auto px-6">
        <table className="w-full min-w-[700px] bg-white text-sm">
          <thead className="text-left text-xs uppercase text-slate-500"><tr>{def.columns.map((c) => <th key={c} className="p-2">{c.replace(/_/g, " ")}</th>)}<th /></tr></thead>
          <tbody className="divide-y">
            {data?.items.map((it) => (
              <tr key={it.id}>
                {def.columns.map((c) => <td key={c} className="p-2">{fmt(it[c])}</td>)}
                <td className="p-2 text-right"><Button size="sm" variant="secondary" onClick={() => setEditing(it)}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <Editor type={type} def={def} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function fmt(v: unknown) {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function toLocalInput(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 16);
}

function Editor({ type, def, item, onClose }: { type: string; def: TypeDef; item: Item | null; onClose: () => void }) {
  const qc = useQueryClient();
  const brgys = useBarangays();
  const [vals, setVals] = useState<Record<string, string | boolean>>(() => {
    const v: Record<string, string | boolean> = {};
    for (const f of def.fields) {
      const raw = item?.[f.col];
      if (f.kind === "bool") v[f.key] = item ? Boolean(raw) : true;
      else if (f.kind === "datetime") v[f.key] = toLocalInput(raw);
      else if (f.kind === "point") v[f.key] = item?.lat ? `${item.lat}, ${item.lng}` : "";
      else if (f.kind === "officials") v[f.key] = Array.isArray(raw) ? (raw as { position: string; name: string; contact?: string }[]).map((o) => [o.position, o.name, o.contact ?? ""].join(" | ")).join("\n") : "";
      else v[f.key] = raw === null || raw === undefined ? "" : String(raw);
    }
    return v;
  });
  const [err, setErr] = useState("");

  function payload() {
    const out: Record<string, unknown> = {};
    for (const f of def.fields) {
      const v = vals[f.key];
      if (f.kind === "bool") out[f.key] = v;
      else if (v === "" || v === undefined) out[f.key] = f.required ? "" : null;
      else if (f.kind === "number") out[f.key] = Number(v);
      else if (f.kind === "datetime") out[f.key] = new Date(`${v}:00+08:00`).toISOString();
      else if (f.kind === "point") {
        const [lat, lng] = String(v).split(",").map((x) => Number(x.trim()));
        out[f.key] = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      } else if (f.kind === "officials") {
        out[f.key] = String(v).split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0] && p[1])
          .map(([position, name, contact]) => ({ position, name, ...(contact ? { contact } : {}) }));
      } else out[f.key] = v;
    }
    return out;
  }

  async function save() {
    setErr("");
    try {
      if (item) await api(`/api/admin/content/${type}/${item.id}`, { method: "PATCH", body: payload() });
      else await api(`/api/admin/content/${type}`, { body: payload() });
      void qc.invalidateQueries({ queryKey: ["content", type] });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function remove() {
    if (!item || !window.confirm("Delete this item? Residents will no longer see it.")) return;
    await api(`/api/admin/content/${type}/${item.id}`, { method: "DELETE" });
    void qc.invalidateQueries({ queryKey: ["content", type] });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`${item ? "Edit" : "New"} — ${def.label}${item?.name ? `: ${item.name}` : ""}`}>
      <div className="max-h-[65vh] space-y-3 overflow-auto pr-1">
        {def.fields.map((f) => (
          <div key={f.key}>
            {f.kind === "bool" ? (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(vals[f.key])} onChange={(e) => setVals({ ...vals, [f.key]: e.target.checked })} /> {f.label}</label>
            ) : (
              <>
                <Label>{f.label}</Label>
                {f.kind === "textarea" || f.kind === "officials" ? <Textarea rows={f.kind === "officials" ? 5 : 3} value={String(vals[f.key])} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                  : f.kind === "barangay" ? <Select value={String(vals[f.key])} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}><option value="">—</option>{brgys.data?.barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
                  : f.kind === "select" ? <Select value={String(vals[f.key])} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>{f.options!.map((o) => <option key={o}>{o}</option>)}</Select>
                  : <Input type={f.kind === "number" ? "number" : f.kind === "datetime" ? "datetime-local" : "text"} value={String(vals[f.key])} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder={f.kind === "point" ? "14.6560, 120.9432" : undefined} />}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <ErrorText>{err}</ErrorText>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={save}>Save</Button>
          {item && def.canDelete && <Button variant="danger" onClick={remove}>Delete</Button>}
        </div>
      </div>
    </Modal>
  );
}
