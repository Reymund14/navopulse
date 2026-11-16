"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, Layers, Radio, Volume2, VolumeX, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useDeferredValue, useMemo, useState } from "react";
import { defaultFilters, Filters, filtersToQuery, useBarangays, type FilterState } from "@/components/dashboard/Filters";
import { IncidentDetail } from "@/components/dashboard/IncidentDetail";
import type { MapIncident, MapUnit } from "@/components/dashboard/IncidentMap";
import { useStaff } from "@/components/dashboard/session";
import { useIncidentFeed } from "@/components/dashboard/useIncidentFeed";
import { cx, PriorityBadge, StatusBadge } from "@/components/ui";
import { api, fmtAgo } from "@/lib/client";

const IncidentMap = dynamic(() => import("@/components/dashboard/IncidentMap"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-slate-200" /> });

type Row = MapIncident & { source: string; description: string; unit: string | null; people_affected: number | null };

export default function CommandMap() {
  const { can } = useStaff();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const qs = filtersToQuery(useDeferredValue(filters));
  const [layers, setLayers] = useState({ pins: true, heat: false, boundaries: true, units: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const { alerts, dismiss, connected } = useIncidentFeed(sound);

  const incidents = useQuery({ queryKey: ["incidents", qs], queryFn: () => api<{ incidents: Row[] }>(`/api/incidents?${qs}`), placeholderData: (p) => p });
  const brgys = useBarangays(true);
  const units = useQuery({ queryKey: ["units"], queryFn: () => api<{ units: MapUnit[] }>("/api/units"), enabled: can("units.read"), refetchInterval: 30_000 });
  const rows = useMemo(() => incidents.data?.incidents ?? [], [incidents.data]);
  const fresh = useMemo(() => new Set(alerts.map((a) => a.id)), [alerts]);
  const counts = useMemo(() => ({
    open: rows.filter((r) => !["resolved", "rejected", "duplicate"].includes(r.status)).length,
    critical: rows.filter((r) => r.priority === "critical" && !["resolved", "rejected", "duplicate"].includes(r.status)).length,
    unassigned: rows.filter((r) => ["submitted", "verified"].includes(r.status)).length,
  }), [rows]);

  return (
    <div className="flex h-full flex-col">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-2">
        <Filters value={filters} onChange={setFilters} />
        <div className="flex items-center gap-3 text-xs">
          <span className={cx("flex items-center gap-1", connected ? "text-emerald-600" : "text-slate-400")}><Radio size={14} /> {connected ? "Live" : "Connecting…"}</span>
          <button onClick={() => setSound(!sound)} className="text-slate-500 hover:text-slate-800" aria-label="Toggle alert sound">{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <IncidentMap incidents={rows} barangays={brgys.data?.barangays} units={units.data?.units} layers={layers} selectedId={selected} onSelect={setSelected} highlightIds={fresh} />
          <div className="absolute left-14 top-3 z-[500] flex gap-2">
            <Stat label="Open" value={counts.open} />
            <Stat label="Critical" value={counts.critical} tone="red" />
            <Stat label="Unassigned" value={counts.unassigned} tone="amber" />
          </div>
          <div className="absolute bottom-6 left-3 z-[500] rounded-lg bg-white/95 p-2 text-xs shadow ring-1 ring-slate-200">
            <div className="mb-1 flex items-center gap-1 font-semibold"><Layers size={12} /> Layers</div>
            {(["pins", "heat", "boundaries", "units"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5 capitalize">
                <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {k === "pins" ? "Incidents (clustered)" : k === "heat" ? "Heatmap" : k}
              </label>
            ))}
          </div>
          <div className="absolute right-3 top-3 z-[600] w-80 space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className={cx("flex items-start gap-2 rounded-lg p-3 text-sm shadow-lg ring-1", a.module === "emergency" ? "bg-red-600 text-white ring-red-700" : "bg-white ring-slate-200")}>
                <BellRing size={16} className="mt-0.5 shrink-0" />
                <button className="flex-1 text-left" onClick={() => setSelected(a.id)}>
                  <div className="font-semibold">{a.module === "emergency" ? "New SOS report" : "New report"}</div>
                  <div className="font-mono text-xs opacity-90">{a.controlNumber}</div>
                </button>
                <button onClick={() => dismiss(a.id)} aria-label="Dismiss"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <aside className="no-print hidden w-[380px] shrink-0 flex-col border-l bg-white xl:flex">
          {selected ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <button onClick={() => setSelected(null)} className="mb-3 text-xs text-navy-600 hover:underline">← Back to list</button>
              <IncidentDetail id={selected} compact />
            </div>
          ) : (
            <>
              <div className="border-b px-4 py-2 text-xs text-slate-500">{incidents.isFetching ? "Updating…" : `${rows.length} incidents`}</div>
              <ul className="min-h-0 flex-1 divide-y overflow-auto">
                {rows.slice(0, 200).map((r) => (
                  <li key={r.id}>
                    <button onClick={() => setSelected(r.id)} className={cx("w-full px-4 py-2.5 text-left hover:bg-slate-50", fresh.has(r.id) && "bg-red-50")}>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                        <span className="font-mono text-xs font-semibold">{r.control_number}</span>
                        <PriorityBadge priority={r.priority as never} />
                        <span className="ml-auto text-[11px] text-slate-400">{fmtAgo(r.created_at)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-sm">{r.category_name} · {r.barangay ?? "—"}</div>
                      <div className="mt-1 flex items-center gap-2"><StatusBadge status={r.status} />{r.unit && <span className="truncate text-[11px] text-slate-500">{r.unit}</span>}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
        {selected && (
          <div className="fixed inset-x-0 bottom-0 z-[1000] max-h-[70%] overflow-auto rounded-t-2xl bg-white p-4 shadow-2xl xl:hidden">
            <button onClick={() => setSelected(null)} className="mb-2 text-xs text-navy-600">Close ✕</button>
            <IncidentDetail id={selected} compact />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" }) {
  return (
    <div className="rounded-lg bg-white/95 px-3 py-1.5 shadow ring-1 ring-slate-200">
      <div className={cx("text-lg font-bold leading-none", tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-navy-800")}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
