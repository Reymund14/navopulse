"use client";

import { ROLE_LABELS } from "@navopulse/shared";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, ClipboardList, FileText, LayoutDashboard, LogOut, Map, Megaphone, MessageSquare, Shield, Truck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import type { Permission } from "@/lib/rbac";
import { cx } from "../ui";
import { useStaff } from "./session";
import { Seal, SealStripe } from "@/components/Brand";

const NAV: { href: string; label: string; icon: typeof Map; perm?: Permission }[] = [
  { href: "/dashboard", label: "Command map", icon: Map, perm: "incident.read" },
  { href: "/dashboard/incidents", label: "Incidents", icon: ClipboardList, perm: "incident.read" },
  { href: "/dashboard/units", label: "Field crews", icon: Truck, perm: "units.read" },
  { href: "/dashboard/broadcasts", label: "Broadcast alerts", icon: Megaphone, perm: "broadcast.send" },
  { href: "/dashboard/inquiries", label: "NavoBot tickets", icon: MessageSquare, perm: "analytics.read" },
  { href: "/dashboard/content", label: "Content", icon: FileText, perm: "content.manage" },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, perm: "analytics.read" },
  { href: "/dashboard/logs", label: "Notification log", icon: Bell, perm: "notifications.read" },
  { href: "/dashboard/users", label: "Users", icon: Users, perm: "users.manage" },
  { href: "/dashboard/audit", label: "Audit log", icon: Shield, perm: "audit.read" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, can } = useStaff();
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    qc.clear();
    router.replace("/dashboard/login");
  }

  const items = NAV.filter((n) => !n.perm || can(n.perm));
  return (
    <div className="flex h-full">
      <aside className={cx("no-print fixed inset-y-0 left-0 z-[1500] w-60 flex-col bg-navy-900 text-navy-100 lg:static lg:flex", open ? "flex" : "hidden")}>
        <div className="flex items-center gap-3 px-4 py-4">
          <Seal size={44} />
          <div>
            <div className="font-bold text-white">NavoPulse</div>
            <div className="text-[11px] uppercase tracking-wider text-seal-gold">City of Navotas</div>
            <div className="text-[10px] uppercase tracking-wider text-navy-300">Command Dashboard</div>
          </div>
        </div>
        <SealStripe className="mx-4 mb-3 rounded-full" />
        <nav className="flex-1 space-y-0.5 px-2">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === "/dashboard" ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm", active ? "bg-navy-700 text-white shadow-[inset_3px_0_0_var(--color-seal-gold)]" : "hover:bg-navy-800")}>
                <Icon size={16} /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-navy-800 p-3 text-xs">
          <div className="font-medium text-white">{user.fullName}</div>
          <div className="text-navy-300">{ROLE_LABELS[user.role]}</div>
          <button onClick={logout} className="mt-2 flex items-center gap-2 text-navy-200 hover:text-white">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b bg-white px-4 py-2 lg:hidden">
          <button onClick={() => setOpen(!open)} className="rounded p-1 ring-1 ring-slate-300" aria-label="Menu">
            <LayoutDashboard size={18} />
          </button>
          <Seal size={28} />
          <span className="font-semibold text-navy-900">NavoPulse</span>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-4 pt-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
