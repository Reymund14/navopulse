"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Search } from "lucide-react";
import { useState } from "react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { api } from "@/lib/client";

interface B { id: string; name: string; district: number; hotline: string | null; address: string | null; officials: { position: string; name: string; contact?: string }[]; lat: number; lng: number }

export default function Directory() {
  const { t, config } = useCitizen();
  const { data } = useQuery({ queryKey: ["barangays", false], queryFn: () => api<{ barangays: B[] }>("/api/public/barangays") });
  const [q, setQ] = useState("");
  const list = (data?.barangays ?? []).filter((b) => b.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen title={t("directory")}>
      <div className="space-y-3">
        <div className="rounded-2xl bg-red-50 p-4 text-sm ring-1 ring-red-100">
          <div className="font-semibold text-red-800">{t("hotline")}</div>
          <a href="tel:911" className="mt-1 flex items-center gap-2 font-bold text-red-700"><Phone size={14} /> 911</a>
          {config && <div className="mt-1 space-y-0.5 text-xs text-red-900">{[config.hotlines.drrmo, config.hotlines.bfp, config.hotlines.pnp].map((h) => <div key={h}>{h}</div>)}</div>}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
          <Search size={16} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("barangay")} className="flex-1 outline-none" />
        </div>
        {list.map((b) => (
          <details key={b.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-semibold">{b.name}</span>
              <span className="text-xs text-slate-500">District {b.district}</span>
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              {b.hotline && <div className="flex items-center gap-2"><Phone size={14} /> {b.hotline}</div>}
              {b.address && <div className="flex items-center gap-2"><MapPin size={14} /> {b.address}</div>}
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">{t("officials")}</div>
                <ul>{b.officials.map((o, i) => <li key={i}>{o.position}: {o.name}{o.contact ? ` · ${o.contact}` : ""}</li>)}</ul>
              </div>
              <a className="inline-block text-xs text-navy-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`}>{t("directions")}</a>
            </div>
          </details>
        ))}
      </div>
    </Screen>
  );
}
