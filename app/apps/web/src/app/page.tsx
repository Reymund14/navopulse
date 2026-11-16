import Link from "next/link";
import { Seal, SealStripe } from "@/components/Brand";

export default function Landing() {
  return (
    <main className="seal-sunburst min-h-full text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <Seal size={140} className="shadow-2xl" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seal-gold">City of Navotas</p>
            <h1 className="text-4xl font-bold tracking-tight">NavoPulse</h1>
            <p className="mt-1 text-navy-100">Civic engagement, disaster response, and public assistance</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-navy-200">Integrity · Responsive · Self-sufficiency</p>
          </div>
          <SealStripe className="w-40 rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/app" className="rounded-2xl border-t-4 border-seal-red bg-white p-6 text-navy-900 shadow-lg transition hover:-translate-y-0.5">
            <div className="text-sm font-semibold uppercase tracking-wide text-sea-600">For residents</div>
            <div className="mt-1 text-xl font-bold">Citizen app</div>
            <p className="mt-2 text-sm text-slate-600">One-tap SOS, DisipliNavo reporting, report tracking, NavoBot, transit, barangay directory and advisories.</p>
          </Link>
          <Link href="/dashboard" className="rounded-2xl border-t-4 border-seal-green bg-navy-950/70 p-6 ring-1 ring-white/20 transition hover:-translate-y-0.5">
            <div className="text-sm font-semibold uppercase tracking-wide text-seal-gold">For LGU staff</div>
            <div className="mt-1 text-xl font-bold">Web Command Dashboard</div>
            <p className="mt-2 text-sm text-navy-100">Live GIS map, dispatch, field crews, broadcasts, content, analytics and audit logs for DRRMO, TMO and PIO.</p>
          </Link>
        </div>
        <p className="text-xs text-navy-200">Prototype for the OLFU Master in IT capstone. Demo data only: hotline numbers, officials and barangay boundaries are placeholders.</p>
      </div>
    </main>
  );
}
