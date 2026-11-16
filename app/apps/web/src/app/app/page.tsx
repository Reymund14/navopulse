"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, Building2, Bus, Camera, Megaphone, Phone, Store } from "lucide-react";
import Link from "next/link";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { cx } from "@/components/ui";
import { api } from "@/lib/client";

interface Advisory { id: string; title: string; body_en: string; body_fil: string; severity: string }

export default function CitizenHome() {
  const { t, lang, me, config } = useCitizen();
  const adv = useQuery({ queryKey: ["advisories", me?.barangayId], queryFn: () => api<{ advisories: Advisory[] }>(`/api/public/advisories${me?.barangayId ? `?barangayId=${me.barangayId}` : ""}`) });
  const top = adv.data?.advisories[0];
  const tiles = [
    { href: "/app/report", label: t("report"), icon: Camera, color: "bg-amber-500" },
    { href: "/app/chat", label: t("navobot"), icon: Bot, color: "bg-sea-600" },
    { href: "/app/transport", label: t("transport"), icon: Bus, color: "bg-navy-500" },
    { href: "/app/directory", label: t("directory"), icon: Building2, color: "bg-navy-600" },
    { href: "/app/angat", label: t("angat"), icon: Store, color: "bg-seal-red" },
    { href: "/app/advisories", label: t("advisories"), icon: Megaphone, color: "bg-seal-orange" },
  ];
  return (
    <div className="space-y-5 px-4 pt-4">
      <div>
        <p className="text-sm text-slate-500">{me?.fullName ? `${lang === "fil" ? "Kumusta" : "Hello"}, ${me.fullName.split(" ")[0]}!` : t("tagline")}</p>
      </div>
      {top && (
        <Link href="/app/advisories" className={cx("flex gap-3 rounded-2xl p-4 shadow-sm", top.severity === "critical" ? "bg-red-600 text-white" : top.severity === "warning" ? "bg-orange-100 text-orange-950" : "bg-amber-50 text-amber-950 ring-1 ring-amber-200")}>
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <div>
            <div className="font-semibold">{top.title}</div>
            <div className="line-clamp-2 text-sm opacity-90">{lang === "fil" ? top.body_fil : top.body_en}</div>
          </div>
        </Link>
      )}
      <Link href="/app/sos" className="np-pulse mx-auto flex aspect-square w-56 flex-col items-center justify-center rounded-full bg-red-600 text-white shadow-xl ring-8 ring-red-100 active:scale-95" aria-label={`${t("sos")} — ${t("sosHint")}`}>
        <span className="text-5xl font-black tracking-wider">SOS</span>
        <span className="mt-1 text-sm font-medium opacity-90">{t("sosHint")}</span>
      </Link>
      <a href={`tel:${config?.hotlines.national ?? "911"}`} className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm ring-1 ring-red-200">
        <Phone size={16} /> {t("callHotline")}
      </a>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map(({ href, label, icon: Icon, color }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200 active:bg-slate-50">
            <span className={cx("flex h-12 w-12 items-center justify-center rounded-xl text-white", color)}><Icon size={24} /></span>
            <span className="text-xs font-medium leading-tight text-slate-700">{label}</span>
          </Link>
        ))}
      </div>
      {!me && (
        <div className="rounded-2xl bg-navy-50 p-4 text-sm text-navy-900 ring-1 ring-navy-100">
          {t("guestNote")} <Link href="/app/login" className="font-semibold underline">{t("login")}</Link>
        </div>
      )}
    </div>
  );
}
