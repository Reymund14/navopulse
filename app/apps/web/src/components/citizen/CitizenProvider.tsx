"use client";

import { t as translate, type Language, type MessageKey } from "@navopulse/shared";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/lib/client";
import { flushQueue, queue, type QueuedReport } from "@/lib/offlineQueue";

interface Me { id: string; role: string; fullName: string | null; barangayId: string | null; preferredLanguage: Language }
interface Config { smsGatewayNumber: string; hotlines: Record<string, string>; navobot: { mode: "directline" | "demo" } }

interface Ctx {
  lang: Language;
  setLang: (l: Language) => void;
  t: (k: MessageKey) => string;
  me: Me | null;
  meLoading: boolean;
  refreshMe: () => void;
  config: Config | null;
  online: boolean;
  pending: QueuedReport[];
}

const C = createContext<Ctx | null>(null);
export const useCitizen = () => {
  const v = useContext(C);
  if (!v) throw new Error("useCitizen outside provider");
  return v;
};

// Browser state read through useSyncExternalStore so server and client renders agree.
function subscribe(events: string[]) {
  return (cb: () => void) => {
    for (const e of events) window.addEventListener(e, cb);
    return () => {
      for (const e of events) window.removeEventListener(e, cb);
    };
  };
}
const subLang = subscribe(["np-lang", "storage"]);
const subOnline = subscribe(["online", "offline"]);
const subQueue = subscribe(["np-queue", "storage"]);
function readLang(): Language {
  try {
    const v = localStorage.getItem("np_lang");
    return v === "en" ? "en" : "fil";
  } catch {
    return "fil";
  }
}
function readQueueRaw() {
  try {
    return localStorage.getItem("np_queue") ?? "[]";
  } catch {
    return "[]";
  }
}

function Inner({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const lang = useSyncExternalStore(subLang, readLang, () => "fil" as Language);
  const online = useSyncExternalStore(subOnline, () => navigator.onLine, () => true);
  const queueRaw = useSyncExternalStore(subQueue, readQueueRaw, () => "[]");
  const pending = useMemo(() => {
    void queueRaw;
    return queue.list();
  }, [queueRaw]);
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: Me | null }>("/api/auth/me"), staleTime: 60_000 });
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/api/public/config"), staleTime: Infinity });
  const me = meQ.data?.user && meQ.data.user.role === "citizen" ? meQ.data.user : null;

  useEffect(() => {
    const flush = () => void flushQueue().then((n) => { if (n) void qc.invalidateQueries({ queryKey: ["my-reports"] }); });
    window.addEventListener("online", flush);
    flush();
    const timer = setInterval(flush, 30_000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", flush);
      clearInterval(timer);
    };
  }, [qc]);

  useEffect(() => {
    document.documentElement.lang = lang === "fil" ? "fil" : "en";
  }, [lang]);

  const setLang = useCallback((l: Language) => {
    try { localStorage.setItem("np_lang", l); } catch { /* ignore */ }
    window.dispatchEvent(new Event("np-lang"));
  }, []);

  return (
    <C.Provider value={{
      lang, setLang, t: (k) => translate(lang, k), me, meLoading: meQ.isLoading,
      refreshMe: () => void qc.invalidateQueries({ queryKey: ["me"] }), config: cfg.data ?? null, online, pending,
    }}>
      {children}
    </C.Provider>
  );
}

export function CitizenProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  return <QueryClientProvider client={client}><Inner>{children}</Inner></QueryClientProvider>;
}
