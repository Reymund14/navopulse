"use client";

import { useQuery } from "@tanstack/react-query";
import { Bus, MapPin } from "lucide-react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { api } from "@/lib/client";

interface Route { id: string; code: string; name: string; mode: string; origin: string; destination: string; fare_min: number | null; fare_notes: string | null; description: string; stops: { name: string; kind: string; lat: number; lng: number }[] }

export default function Transport() {
  const { t } = useCitizen();
  const { data } = useQuery({ queryKey: ["transit"], queryFn: () => api<{ routes: Route[] }>("/api/public/transit") });
  return (
    <Screen title={t("transport")}>
      <div className="space-y-3">
        {data?.routes.map((r) => (
          <details key={r.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <summary className="flex cursor-pointer list-none items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Bus size={20} /></span>
              <div className="flex-1">
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs capitalize text-slate-500">{r.mode.replace("_", " ")} · {r.origin} → {r.destination}</div>
              </div>
              {r.fare_min !== null && <div className="text-right"><div className="text-xs text-slate-500">{t("fare")}</div><div className="font-bold">₱{r.fare_min.toFixed(0)}</div></div>}
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              {r.description && <p className="text-slate-700">{r.description}</p>}
              {r.fare_notes && <p className="text-xs text-slate-500">{r.fare_notes}</p>}
              <ol className="space-y-1">
                {r.stops.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <MapPin size={14} className={s.kind === "terminal" ? "text-navy-700" : "text-slate-400"} />
                    <span className={s.kind === "terminal" ? "font-medium" : ""}>{s.name}</span>
                    <a className="ml-auto text-xs text-navy-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}>{t("directions")}</a>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        ))}
      </div>
    </Screen>
  );
}
