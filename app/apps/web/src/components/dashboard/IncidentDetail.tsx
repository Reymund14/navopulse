"use client";

import { STATUS_LABELS, type IncidentStatus, type Priority } from "@navopulse/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ExternalLink, Eye, MapPin, Navigation, Phone, Star, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, fmtDateTime } from "@/lib/client";
import { compressImage } from "@/lib/image";
import { Button, ErrorText, Label, Modal, PriorityBadge, Select, StatusBadge, Textarea } from "../ui";
import { useStaff } from "./session";

interface Detail {
  id: string; control_number: string; status: IncidentStatus; priority: Priority; module: string; source: string;
  description: string; address_text: string | null; people_affected: number | null; location_source: string;
  location_accuracy_m: number | null; observed_at: string | null; created_at: string; verified_at: string | null;
  assigned_at: string | null; resolved_at: string | null; resolution_note: string | null; duplicate_of_id: string | null;
  duplicate_of_control_number: string | null; assigned_unit_id: string | null; unit_name: string | null; unit_contact: string | null;
  lat: number; lng: number; category_name: string; color: string; default_office: string; barangay: string | null;
  feedback_rating: number | null; feedback_comment: string | null;
  reporter: { name: string | null; mobile: string | null; masked: boolean; canReveal: boolean; registered: boolean };
  history: { from_status: string | null; to_status: IncidentStatus; note: string | null; created_at: string; changed_by: string | null }[];
  notes: { id: string; body: string; created_at: string; author: string }[];
  media: { id: string; type: "report" | "resolution"; exif_lat: number | null; exif_lng: number | null; exif_taken_at: string | null }[];
  possibleDuplicates: { id: string; control_number: string; status: IncidentStatus; created_at: string; distance_m: number }[];
}

interface Unit { id: string; name: string; office: string; type: string; is_available: boolean; active_incidents: number }

const SOURCE_LABEL: Record<string, string> = { app: "Citizen app", sms: "SMS (offline)", navobot: "NavoBot", walk_in: "Walk-in / phone" };

export function IncidentDetail({ id, compact = false }: { id: string; compact?: boolean }) {
  const { can, user } = useStaff();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({ queryKey: ["incident", id], queryFn: () => api<{ incident: Detail }>(`/api/incidents/${id}`) });
  const units = useQuery({ queryKey: ["units"], queryFn: () => api<{ units: Unit[] }>("/api/units"), enabled: can("units.read") });
  const [revealed, setRevealed] = useState<{ name: string | null; mobile: string | null } | null>(null);
  const [modal, setModal] = useState<null | "assign" | "resolve" | "reject" | "merge">(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["incident", id] });
    void qc.invalidateQueries({ queryKey: ["incidents"] });
    void qc.invalidateQueries({ queryKey: ["units"] });
  };
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api(`/api/incidents/${id}/${path}`, { body }),
    onSuccess: () => {
      setModal(null);
      setErr("");
      refresh();
    },
    onError: (e: Error) => setErr(e.message),
  });

  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (error || !data) return <div className="p-6"><ErrorText>{(error as Error)?.message ?? "Not found"}</ErrorText></div>;
  const inc = data.incident;
  const open = !["resolved", "rejected", "duplicate"].includes(inc.status);
  const manage = can("incident.manage");
  const respond = can("incident.respond") && (user.role !== "field_responder" || inc.assigned_unit_id === user.unitId);
  const reporter = revealed ?? inc.reporter;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${inc.lat},${inc.lng}&travelmode=driving`;
  const osm = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${inc.lat}%2C${inc.lng}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: inc.color }} />
            <h2 className="font-mono text-lg font-bold">{inc.control_number}</h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={inc.status} /> <PriorityBadge priority={inc.priority} />
            <span className="text-slate-600">{inc.category_name}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{SOURCE_LABEL[inc.source] ?? inc.source}</span>
          </div>
        </div>
        {compact && <Link href={`/dashboard/incidents/${inc.id}`} className="flex items-center gap-1 text-xs text-navy-600 hover:underline">Open full view <ExternalLink size={12} /></Link>}
      </div>

      {inc.description && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{inc.description}</p>}

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-medium"><MapPin size={14} /> {inc.barangay ?? "Unknown barangay"}</div>
          <div className="text-xs text-slate-500">
            {inc.lat.toFixed(5)}, {inc.lng.toFixed(5)} · from {inc.location_source.replace("_", " ")}
            {inc.location_accuracy_m ? ` (±${Math.round(inc.location_accuracy_m)} m)` : ""}
          </div>
          {inc.address_text && <div className="text-xs text-slate-500">{inc.address_text}</div>}
          <div className="flex gap-2 pt-1">
            <a href={gmaps} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-navy-700 px-2 py-1 text-xs text-white"><Navigation size={12} /> Navigate (Google)</a>
            <a href={osm} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs ring-1 ring-slate-300">OSM route</a>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-medium"><User size={14} /> {reporter.name ?? "Anonymous"} {!inc.reporter.registered && <span className="text-xs font-normal text-slate-400">(no account)</span>}</div>
          {reporter.mobile && <div className="flex items-center gap-1.5 text-xs text-slate-600"><Phone size={12} /> {reporter.mobile}</div>}
          {inc.people_affected !== null && <div className="text-xs text-slate-600">People affected: <b>{inc.people_affected}</b></div>}
          {inc.reporter.masked && inc.reporter.canReveal && !revealed && (
            <button className="inline-flex items-center gap-1 text-xs text-navy-600 hover:underline"
              onClick={async () => setRevealed((await api<{ reporter: { name: string; mobile: string } }>(`/api/incidents/${id}/reveal`, { method: "POST" })).reporter)}>
              <Eye size={12} /> Reveal contact (logged)
            </button>
          )}
          {inc.reporter.masked && !inc.reporter.canReveal && <div className="text-xs text-slate-400">Reporter identity is masked for your role (RA 10173).</div>}
        </div>
      </div>

      {inc.media.length > 0 && (
        <div>
          <Label>Photos</Label>
          <div className="flex flex-wrap gap-2">
            {inc.media.map((m) => (
              <a key={m.id} href={`/api/media/${m.id}`} target="_blank" rel="noreferrer" className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${m.id}`} alt={m.type} className="h-24 w-24 rounded-lg object-cover ring-1 ring-slate-200" />
                <span className={`absolute bottom-1 left-1 rounded px-1 text-[10px] text-white ${m.type === "resolution" ? "bg-emerald-600" : "bg-black/60"}`}>
                  {m.type === "resolution" ? "Resolution" : m.exif_lat ? "EXIF GPS" : "Report"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {inc.unit_name && <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">Assigned to <b>{inc.unit_name}</b>{inc.unit_contact ? ` · ${inc.unit_contact}` : ""}</div>}
      {inc.duplicate_of_id && (
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">Duplicate of <Link className="font-mono text-navy-700 underline" href={`/dashboard/incidents/${inc.duplicate_of_id}`}>{inc.duplicate_of_control_number}</Link></div>
      )}
      {inc.resolution_note && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><b>Resolution:</b> {inc.resolution_note}</div>}
      {inc.feedback_rating && (
        <div className="flex items-center gap-1 text-sm">
          Citizen rating: {Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} className={i < inc.feedback_rating! ? "fill-amber-400 text-amber-400" : "text-slate-300"} />)}
          {inc.feedback_comment && <span className="ml-2 text-slate-600">“{inc.feedback_comment}”</span>}
        </div>
      )}

      <ErrorText>{err}</ErrorText>
      {open && (manage || respond) && (
        <div className="flex flex-wrap gap-2">
          {manage && inc.status === "submitted" && <Button size="sm" onClick={() => act.mutate({ path: "status", body: { status: "verified" } })}>Verify</Button>}
          {manage && <Button size="sm" variant="secondary" onClick={() => setModal("assign")}>{inc.assigned_unit_id ? "Reassign" : "Assign crew"}</Button>}
          {respond && inc.status === "assigned" && <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: "status", body: { status: "in_progress" } })}>Start response</Button>}
          {respond && ["verified", "assigned", "in_progress"].includes(inc.status) && <Button size="sm" variant="success" onClick={() => setModal("resolve")}>Resolve</Button>}
          {manage && ["submitted", "verified"].includes(inc.status) && <Button size="sm" variant="secondary" onClick={() => setModal("merge")}>Merge duplicate</Button>}
          {manage && ["submitted", "verified", "assigned"].includes(inc.status) && <Button size="sm" variant="ghost" onClick={() => setModal("reject")}>Reject</Button>}
        </div>
      )}

      {inc.possibleDuplicates.length > 0 && open && manage && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
          <b>Possible duplicates</b> (same category, within 150 m and 24 h):
          <ul className="mt-1 space-y-0.5">
            {inc.possibleDuplicates.map((d) => (
              <li key={d.id}><Link href={`/dashboard/incidents/${d.id}`} className="font-mono underline">{d.control_number}</Link> · {STATUS_LABELS[d.status].en} · {d.distance_m} m · {fmtDateTime(d.created_at)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={compact ? "" : "grid gap-6 md:grid-cols-2"}>
        <div>
          <Label>Timeline</Label>
          <ol className="relative space-y-3 border-l border-slate-200 pl-4">
            {inc.history.map((h, i) => (
              <li key={i} className="text-sm">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-white ring-2 ring-navy-400" />
                <div className="flex flex-wrap items-center gap-2"><StatusBadge status={h.to_status} /><span className="text-xs text-slate-500">{fmtDateTime(h.created_at)}</span></div>
                <div className="text-xs text-slate-600">{h.changed_by ?? "System"}{h.note ? ` — ${h.note}` : ""}</div>
              </li>
            ))}
          </ol>
        </div>
        <div className={compact ? "mt-4" : ""}>
          <Label>Internal notes</Label>
          <div className="space-y-2">
            {inc.notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-slate-50 p-2 text-sm"><div className="text-xs text-slate-500">{n.author} · {fmtDateTime(n.created_at)}</div>{n.body}</div>
            ))}
            {(manage || respond) && (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act.mutate({ path: "notes", body: { body: note } }, { onSuccess: () => setNote("") }); }}>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <Button size="sm" type="submit">Add</Button>
              </form>
            )}
          </div>
        </div>
      </div>

      <AssignModal open={modal === "assign"} onClose={() => setModal(null)} units={(units.data?.units ?? []).filter((u) => inc.default_office === "PIO" || u.office === inc.default_office || user.role === "super_admin")}
        onSubmit={(unitId, n) => act.mutate({ path: "assign", body: { unitId, note: n || undefined } })} busy={act.isPending} />
      <ResolveModal open={modal === "resolve"} onClose={() => setModal(null)} busy={act.isPending}
        onSubmit={(n, mediaIds) => act.mutate({ path: "resolve", body: { note: n, mediaIds } })} />
      <NoteModal open={modal === "reject"} title="Reject report" cta="Reject" onClose={() => setModal(null)} busy={act.isPending}
        onSubmit={(n) => act.mutate({ path: "status", body: { status: "rejected", note: n } })} />
      <MergeModal open={modal === "merge"} onClose={() => setModal(null)} busy={act.isPending} candidates={inc.possibleDuplicates.filter((d) => d.status !== "duplicate")}
        onSubmit={(dupId, n) => act.mutate({ path: "merge", body: { duplicateOfId: dupId, note: n || undefined } })} />
    </div>
  );
}

function AssignModal({ open, onClose, units, onSubmit, busy }: { open: boolean; onClose: () => void; units: Unit[]; onSubmit: (id: string, note: string) => void; busy: boolean }) {
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Assign field crew">
      <div className="space-y-3">
        <div>
          <Label>Response unit</Label>
          <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Select a unit…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.type} {u.is_available ? "(available)" : `(deployed, ${u.active_incidents} active)`}</option>)}
          </Select>
        </div>
        <div><Label hint="optional">Instructions</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <Button disabled={!unit || busy} onClick={() => onSubmit(unit, note)} className="w-full">Assign and notify</Button>
      </div>
    </Modal>
  );
}

function ResolveModal({ open, onClose, onSubmit, busy }: { open: boolean; onClose: () => void; onSubmit: (note: string, mediaIds: string[]) => void; busy: boolean }) {
  const [note, setNote] = useState("");
  const [media, setMedia] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  async function upload(f: File) {
    setUploading(true);
    setErr("");
    try {
      const blob = await compressImage(f);
      const fd = new FormData();
      fd.append("file", blob, "resolution.jpg");
      fd.append("type", "resolution");
      const r = await api<{ media: { id: string } }>("/api/media", { body: fd });
      setMedia((m) => [...m, { id: r.media.id, url: URL.createObjectURL(blob) }]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Resolve incident">
      <div className="space-y-3">
        <div><Label>Resolution notes</Label><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done on site?" /></div>
        <div>
          <Label>Resolution photo</Label>
          <div className="flex flex-wrap gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {media.map((m) => <img key={m.id} src={m.url} alt="" className="h-16 w-16 rounded object-cover" />)}
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded border-2 border-dashed border-slate-300 text-slate-400 hover:border-navy-400">
              {uploading ? "…" : <Camera size={18} />}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
        </div>
        <ErrorText>{err}</ErrorText>
        <p className="text-xs text-slate-500">The reporter is notified automatically and asked to rate the service.</p>
        <Button variant="success" disabled={!note.trim() || busy || uploading} onClick={() => onSubmit(note, media.map((m) => m.id))} className="w-full">Mark resolved</Button>
      </div>
    </Modal>
  );
}

function NoteModal({ open, onClose, onSubmit, busy, title, cta }: { open: boolean; onClose: () => void; onSubmit: (note: string) => void; busy: boolean; title: string; cta: string }) {
  const [note, setNote] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div><Label>Reason (shared with the reporter)</Label><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <Button variant="danger" disabled={!note.trim() || busy} onClick={() => onSubmit(note)} className="w-full">{cta}</Button>
      </div>
    </Modal>
  );
}

function MergeModal({ open, onClose, onSubmit, busy, candidates }: { open: boolean; onClose: () => void; onSubmit: (id: string, note: string) => void; busy: boolean; candidates: Detail["possibleDuplicates"] }) {
  const [target, setTarget] = useState("");
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ id: string; control_number: string }[]>([]);
  async function lookup() {
    const r = await api<{ incidents: { id: string; control_number: string }[] }>(`/api/incidents?q=${encodeURIComponent(search)}&limit=10`);
    setFound(r.incidents);
  }
  const options = [...candidates.map((c) => ({ id: c.id, control_number: `${c.control_number} (${c.distance_m} m away)` })), ...found];
  return (
    <Modal open={open} onClose={onClose} title="Merge as duplicate">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">This report will be closed as a duplicate and the reporter will be told which case tracks it.</p>
        <div className="flex gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search control number" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <Button size="sm" variant="secondary" onClick={lookup}>Search</Button>
        </div>
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Select the original case…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.control_number}</option>)}
        </Select>
        <Button disabled={!target || busy} onClick={() => onSubmit(target, "")} className="w-full">Merge</Button>
      </div>
    </Modal>
  );
}
