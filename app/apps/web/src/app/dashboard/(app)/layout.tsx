"use client";

import { Shell } from "@/components/dashboard/Shell";
import { DashboardProviders } from "@/components/dashboard/session";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProviders>
      <Shell>{children}</Shell>
    </DashboardProviders>
  );
}
