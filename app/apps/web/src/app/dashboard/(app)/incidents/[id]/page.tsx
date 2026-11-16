"use client";

import Link from "next/link";
import { use } from "react";
import { IncidentDetail } from "@/components/dashboard/IncidentDetail";
import { Card } from "@/components/ui";

export default function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link href="/dashboard/incidents" className="text-sm text-navy-600 hover:underline">← Incidents</Link>
      <Card className="mt-3"><IncidentDetail id={id} /></Card>
    </div>
  );
}
