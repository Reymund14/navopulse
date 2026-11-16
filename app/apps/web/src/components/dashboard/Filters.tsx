"use client";

import { INCIDENT_STATUSES, STATUS_LABELS, type IncidentStatus } from "@navopulse/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { cx } from "../ui";

export interface FilterState {
  module: string;
  status: IncidentStatus[];
  source: string;
  barangayId: string;
  from: string;
  to: string;
  q: string;
}

export const OPEN_STATUSES: IncidentStatus[] = ["submitted", "verified", "assigned", "in_progress"];

export const defaultFilters = (): FilterState => ({
  module: "", status: OPEN_STATUSES, source: "", barangayId: "", q: "",
  from: new Date(Date.now() - 6 * 86400_000 + 8 * 3600_000).toISOString().slice(0, 10),
  to: "",
});

export function filtersToQuery(f: FilterState, limit = 5000) {
  const p = new URLSearchParams();
  if (f.module) p.set("module", f.module);
  if (f.status.length && f.status.length < INCIDENT_STATUSES.length) p.set("status", f.status.join(","));
  if (f.source) p.set("source", f.source);
  if (f.barangayId) p.set("barangayId", f.barangayId);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.q) p.set("q", f.q);
  p.set("limit", String(limit));
  return p.toString();
}

export function useBarangays(geo = false) {
  return useQuery({
    queryKey: ["barangays", geo],
    queryFn: () => api<{ barangays: { id: string; name: string; boundary: GeoJSON.Geometry | null }[] }>(`/api/public/barangays${geo ? "?geo=1" : ""}`),
    staleTime: Infinity,
  });
}

const sel = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs";

export function Filters({ value, onChange }: { value: FilterState; onChange: (f: FilterState) => void }) {
  const brgys = useBarangays();
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const toggle = (s: IncidentStatus) => set({ status: value.status.includes(s) ? value.status.filter((x) => x !== s) : [...value.status, s] });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={value.module} onChange={(e) => set({ module: e.target.value })} aria-label="Type">
        <option value="">All types</option><option value="emergency">Emergency</option><option value="civic">Civic</option><option value="traffic">Traffic</option>
      </select>
      <select className={sel} value={value.source} onChange={(e) => set({ source: e.target.value })} aria-label="Source">
        <option value="">All sources</option><option value="app">App</option><option value="sms">SMS</option><option value="navobot">NavoBot</option><option value="walk_in">Walk-in</option>
      </select>
      <select className={sel} value={value.barangayId} onChange={(e) => set({ barangayId: e.target.value })} aria-label="Barangay">
        <option value="">All barangays</option>
        {brgys.data?.barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <input type="date" className={sel} value={value.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" />
      <span className="text-xs text-slate-400">to</span>
      <input type="date" className={sel} value={value.to} onChange={(e) => set({ to: e.target.value })} aria-label="To" />
      <input className={cx(sel, "w-40")} placeholder="Search…" value={value.q} onChange={(e) => set({ q: e.target.value })} />
      <div className="flex flex-wrap gap-1">
        {INCIDENT_STATUSES.map((s) => (
          <button key={s} onClick={() => toggle(s)}
            className={cx("rounded-full px-2 py-0.5 text-[11px] ring-1", value.status.includes(s) ? "bg-navy-700 text-white ring-navy-700" : "bg-white text-slate-500 ring-slate-300")}>
            {STATUS_LABELS[s].en}
          </button>
        ))}
      </div>
    </div>
  );
}
