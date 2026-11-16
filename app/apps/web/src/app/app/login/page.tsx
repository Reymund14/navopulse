"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";
import { api, ClientApiError } from "@/lib/client";

function LoginInner() {
  const { t, lang, refreshMe } = useCitizen();
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/app";
  const [step, setStep] = useState<"mobile" | "code" | "register">("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [barangayId, setBarangayId] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const brgys = useQuery({ queryKey: ["barangays", false], queryFn: () => api<{ barangays: { id: string; name: string }[] }>("/api/public/barangays"), enabled: step === "register" });

  async function requestCode() {
    setBusy(true); setError("");
    try {
      const r = await api<{ devCode?: string }>("/api/auth/otp/request", { body: { mobileNumber: mobile } });
      setDevCode(r.devCode ?? null);
      setStep("code");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError("");
    try {
      await api("/api/auth/otp/verify", {
        body: { mobileNumber: mobile, code, ...(step === "register" ? { fullName, barangayId: barangayId || undefined, preferredLanguage: lang, privacyConsent: consent || undefined } : {}) },
      });
      refreshMe();
      router.replace(next.startsWith("/app") ? next : "/app");
    } catch (e) {
      if (e instanceof ClientApiError && (e.details as { needsRegistration?: boolean })?.needsRegistration) setStep("register");
      else setError((e as Error).message);
    } finally { setBusy(false); }
  }

  const input = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg";
  return (
    <Screen title={t("login")}>
      <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        {step === "mobile" && (
          <>
            <label className="block text-sm font-medium">{t("mobileNumber")}</label>
            <input className={input} inputMode="tel" placeholder="0917 123 4567" value={mobile} onChange={(e) => setMobile(e.target.value)} autoFocus />
            <button disabled={busy || mobile.length < 10} onClick={requestCode} className="w-full rounded-xl bg-navy-700 py-3 font-semibold text-white disabled:bg-navy-300">{t("sendCode")}</button>
          </>
        )}
        {step !== "mobile" && (
          <>
            <label className="block text-sm font-medium">{t("enterCode")}</label>
            <input className={`${input} text-center font-mono tracking-[0.5em]`} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
            {devCode && <p className="rounded-lg bg-amber-50 p-2 text-center text-xs text-amber-800">Demo mode (no SMS provider): your code is <b className="font-mono">{devCode}</b></p>}
          </>
        )}
        {step === "register" && (
          <>
            <p className="rounded-lg bg-navy-50 p-3 text-sm text-navy-900">{lang === "fil" ? "Bago ka rito! Kumpletuhin ang pagrehistro." : "You're new here! Complete your registration."}</p>
            <div><label className="block text-sm font-medium">{t("fullName")}</label><input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div>
              <label className="block text-sm font-medium">{t("barangay")}</label>
              <select className={input} value={barangayId} onChange={(e) => setBarangayId(e.target.value)}>
                <option value="">{t("selectBarangay")}</option>
                {brgys.data?.barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{t("privacyConsent")} <Link href="/app/privacy" target="_blank" className="text-navy-700 underline">{t("privacyNotice")}</Link></span>
            </label>
          </>
        )}
        {step !== "mobile" && (
          <button disabled={busy || code.length !== 6 || (step === "register" && (!consent || !fullName))} onClick={verify} className="w-full rounded-xl bg-navy-700 py-3 font-semibold text-white disabled:bg-navy-300">{t("verify")}</button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Link href="/app" className="block text-center text-sm text-slate-500 underline">{t("guest")}</Link>
      </div>
    </Screen>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
