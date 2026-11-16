"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/dashboard/Shell";
import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/client";

interface Summary {
  range: { from: string; to: string };
  totals: { total: number; open: number; resolved: number; emergencies: number; navobot_tickets: number };
  byStatus: { status: string; count: number }[];
  byCategory: { code: string; name: string; module: string; color: string; count: number }[];
  byBarangay: { barangay: string; count: number; emergencies: number }[];
  bySource: { source: string; count: number }[];
  daily: { day: string; total: number; emergency: number; civic: number; traffic: number; navobot: number }[];
  times: { module: string; avg_response_min: number; median_response_min: number; avg_resolution_h: number | null; resolved: number }[];
  satisfaction: { avg_rating: number | null; responses: number; resolved: number };
  ratingDist: { rating: number; count: number }[];
  inquiries: { total: number; converted: number };
}

const iso = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
// Colour-blind-safe categorical palette (Okabe–Ito based)
const MODULE_COLORS = { emergency: "#D55E00", civic: "#009E73", traffic: "#E69F00", navobot: "#0072B2" };

export default function AnalyticsPage() {
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 86400_000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const qs = `from=${from}&to=${to}`;
  const { data, isLoading } = useQuery({ queryKey: ["analytics", qs], queryFn: () => api<Summary>(`/api/analytics/summary?${qs}`), placeholderData: (p) => p });

  return (
    <div className="pb-10">
      <PageHeader title="Analytics" subtitle={`Manila dates ${from} to ${to}`}
        actions={<>
          <div className="w-40"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /></div>
          <div className="w-40"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /></div>
          <a href={`/api/analytics/export?${qs}`}><Button variant="secondary"><Download size={14} /> CSV</Button></a>
          <a href={`/api/analytics/export?${qs}&format=xlsx`}><Button variant="secondary"><Download size={14} /> Excel</Button></a>
          <Button variant="secondary" onClick={() => window.print()}><Printer size={14} /> PDF</Button>
        </>} />
      {isLoading || !data ? <div className="px-6 text-sm text-slate-500">Loading…</div> : (
        <div className="space-y-6 px-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total reports" value={data.totals.total} />
            <Kpi label="Open" value={data.totals.open} />
            <Kpi label="Resolved" value={data.totals.resolved} sub={data.totals.total ? `${Math.round((data.totals.resolved / data.totals.total) * 100)}%` : ""} />
            <Kpi label="Emergencies" value={data.totals.emergencies} />
            <Kpi label="NavoBot tickets" value={data.totals.navobot_tickets} sub={`${data.inquiries.total} conversations logged`} />
            <Kpi label="Satisfaction" value={data.satisfaction.avg_rating ? `${data.satisfaction.avg_rating.toFixed(2)} / 5` : "—"} sub={`${data.satisfaction.responses} ratings`} />
          </div>

          <Card title="Daily reports by module">
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Line type="linear" dataKey="emergency" stroke={MODULE_COLORS.emergency} strokeWidth={2} dot={false} />
                  <Line type="linear" dataKey="civic" stroke={MODULE_COLORS.civic} strokeWidth={2} dot={false} />
                  <Line type="linear" dataKey="traffic" stroke={MODULE_COLORS.traffic} strokeWidth={2} dot={false} />
                  <Line type="linear" dataKey="navobot" name="via NavoBot" stroke={MODULE_COLORS.navobot} strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="By category">
              <div className="h-[440px]">
                <ResponsiveContainer>
                  <BarChart data={data.byCategory} layout="vertical" margin={{ left: 40 }}>
                    <XAxis type="number" allowDecimals={false} fontSize={11} />
                    <YAxis type="category" dataKey="name" width={150} fontSize={11} interval={0} />
                    <Tooltip />
                    <Bar dataKey="count">{data.byCategory.map((c) => <Cell key={c.code} fill={c.color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="By barangay">
              <div className="h-[440px]">
                <ResponsiveContainer>
                  <BarChart data={data.byBarangay} layout="vertical" margin={{ left: 40 }}>
                    <XAxis type="number" allowDecimals={false} fontSize={11} />
                    <YAxis type="category" dataKey="barangay" width={160} fontSize={11} interval={0} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="All reports" fill="#5584b6" />
                    <Bar dataKey="emergencies" name="Emergencies" fill={MODULE_COLORS.emergency} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Response and resolution times">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr><th>Module</th><th>Avg response</th><th>Median</th><th>Avg resolution</th></tr></thead>
                <tbody>
                  {data.times.map((t) => (
                    <tr key={t.module} className="border-t">
                      <td className="py-2 capitalize">{t.module}</td>
                      <td>{fmtMin(t.avg_response_min)}</td>
                      <td>{fmtMin(t.median_response_min)}</td>
                      <td>{t.avg_resolution_h !== null ? `${t.avg_resolution_h.toFixed(1)} h` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">Response = report to first verification or assignment.</p>
            </Card>
            <Card title="By status and source">
              <div className="space-y-1 text-sm">
                {data.byStatus.map((s) => <Row key={s.status} label={s.status.replace("_", " ")} value={s.count} total={data.totals.total} />)}
                <div className="my-2 border-t" />
                {data.bySource.map((s) => <Row key={s.source} label={s.source.replace("_", "-")} value={s.count} total={data.totals.total} />)}
              </div>
            </Card>
            <Card title="Citizen satisfaction">
              <div className="h-48">
                <ResponsiveContainer>
                  <BarChart data={[1, 2, 3, 4, 5].map((r) => ({ rating: `${r}★`, count: data.ratingDist.find((d) => d.rating === r)?.count ?? 0 }))}>
                    <XAxis dataKey="rating" fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#E69F00" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500">{data.satisfaction.responses} of {data.satisfaction.resolved} resolved cases rated.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtMin(m: number | null) {
  if (m === null || m === undefined) return "—";
  return m < 90 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`;
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-navy-800">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Row({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 capitalize text-slate-600">{label}</span>
      <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-navy-500" style={{ width: `${total ? (value / total) * 100 : 0}%` }} /></div>
      <span className="w-10 text-right tabular-nums">{value}</span>
    </div>
  );
}
