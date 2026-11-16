"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { api } from "@/lib/client";
import { Seal, SealStripe } from "@/components/Brand";

// Demo accounts are listed only in development or when NEXT_PUBLIC_DEMO_MODE=1.
const DEMO = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_MODE === "1";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { body: { email, password } });
      router.replace(next.startsWith("/dashboard") ? next : "/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border-t-4 border-seal-gold bg-white p-8 shadow-xl">
      <div className="flex flex-col items-center gap-2 text-center">
        <Seal size={96} />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-seal-red">City of Navotas</p>
          <h1 className="text-lg font-bold text-navy-900">NavoPulse Command</h1>
          <p className="text-xs text-slate-500">LGU staff sign-in</p>
        </div>
        <SealStripe className="w-24 rounded-full" />
      </div>
      <div>
        <Label>Email</Label>
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label>Password</Label>
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      {DEMO && <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Demo accounts</summary>
        <p className="mt-2">Password for all: <code>NavoPulse!2026</code></p>
        <ul className="mt-1 space-y-0.5">
          {["admin", "dispatch", "tmo", "pio", "responder", "enforcer"].map((u) => (
            <li key={u}>
              <button type="button" className="text-navy-600 hover:underline" onClick={() => { setEmail(`${u}@navopulse.local`); setPassword("NavoPulse!2026"); }}>
                {u}@navopulse.local
              </button>
            </li>
          ))}
        </ul>
      </details>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="seal-sunburst flex min-h-full items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
