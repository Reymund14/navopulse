"use client";

import { Bot, ClipboardList, Home, UserRound, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "../ui";
import { CitizenProvider, useCitizen } from "./CitizenProvider";
import { Seal, SealStripe } from "@/components/Brand";

function Frame({ children }: { children: ReactNode }) {
  const { t, lang, setLang, online, pending } = useCitizen();
  const path = usePathname();
  const tabs = [
    { href: "/app", label: t("home"), icon: Home },
    { href: "/app/reports", label: t("myReports"), icon: ClipboardList },
    { href: "/app/chat", label: "NavoBot", icon: Bot },
    { href: "/app/account", label: t("account"), icon: UserRound },
  ];
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-slate-50">
      <header className="sticky top-0 z-[1100] flex items-center justify-between bg-navy-800 px-4 pb-3.5 pt-3 text-white">
        <Link href="/app" className="flex items-center gap-2">
          <Seal size={34} />
          <span className="leading-tight">
            <span className="block font-bold">NavoPulse</span>
            <span className="block text-[10px] uppercase tracking-wider text-seal-gold">Lungsod ng Navotas</span>
          </span>
        </Link>
        <div className="flex overflow-hidden rounded-full text-xs ring-1 ring-white/40" role="group" aria-label={t("language")}>
          {(["fil", "en"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cx("px-2.5 py-1", lang === l ? "bg-white font-semibold text-navy-800" : "text-white")}>{l === "fil" ? "FIL" : "EN"}</button>
          ))}
        </div>
        <SealStripe className="absolute inset-x-0 bottom-0" />
      </header>
      {(!online || pending.length > 0) && (
        <div className={cx("flex items-center gap-2 px-4 py-2 text-xs", online ? "bg-amber-100 text-amber-900" : "bg-slate-800 text-white")}>
          {!online && <WifiOff size={14} />}
          {!online ? (lang === "fil" ? "Offline ka. " : "You are offline. ") : ""}
          {pending.length > 0 && `${pending.length} ${t("pendingSync")}`}
        </div>
      )}
      <main className="flex-1 pb-24">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-[1100] mx-auto flex max-w-md border-t bg-white pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? path === href : path.startsWith(href);
          return (
            <Link key={href} href={href} className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-navy-700" : "text-slate-500")}>
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function CitizenShell({ children }: { children: ReactNode }) {
  return <CitizenProvider><Frame>{children}</Frame></CitizenProvider>;
}

export function Screen({ title, back = "/app", children }: { title: string; back?: string | null; children: ReactNode }) {
  return (
    <div className="px-4 pt-4">
      <div className="mb-4 flex items-center gap-2">
        {back && <Link href={back} className="rounded-full bg-white px-2.5 py-1 text-sm shadow-sm ring-1 ring-slate-200" aria-label="Back">←</Link>}
        <h1 className="text-xl font-bold text-navy-900">{title}</h1>
      </div>
      {children}
    </div>
  );
}
