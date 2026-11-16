"use client";

import type { Role } from "@navopulse/shared";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import type { Permission } from "@/lib/rbac";

export interface StaffSession {
  user: { id: string; role: Role; fullName: string | null; email: string | null; unitId: string | null };
  permissions: Permission[];
}

const Ctx = createContext<(StaffSession & { can: (p: Permission) => boolean }) | null>(null);

export function useStaff() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStaff outside StaffProvider");
  return v;
}

function Gate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => api<StaffSession | { user: null }>("/api/auth/me"), staleTime: 60_000 });
  const session = data && data.user ? (data as StaffSession) : null;
  useEffect(() => {
    if (!isLoading && (!session || session.user.role === "citizen")) router.replace("/dashboard/login");
  }, [isLoading, session, router]);
  if (!session || session.user.role === "citizen") {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading…</div>;
  }
  return <Ctx.Provider value={{ ...session, can: (p) => session.permissions.includes(p) }}>{children}</Ctx.Provider>;
}

export function DashboardProviders({ children, requireSession = true }: { children: ReactNode; requireSession?: boolean }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  return <QueryClientProvider client={client}>{requireSession ? <Gate>{children}</Gate> : children}</QueryClientProvider>;
}
