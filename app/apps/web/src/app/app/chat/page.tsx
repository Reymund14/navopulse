"use client";

import { Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCitizen } from "@/components/citizen/CitizenProvider";
import { cx } from "@/components/ui";
import { api } from "@/lib/client";

interface Msg { from: "bot" | "me"; text: string; action?: string; suggestions?: string[] }

/** Microsoft Bot Framework Web Chat, loaded from its CDN and connected with a server-issued Direct Line token. */
function CopilotWebChat({ lang }: { lang: "en" | "fil" }) {
  const el = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const w = window as unknown as { WebChat?: { renderWebChat: (o: object, el: HTMLElement) => void; createDirectLine: (o: object) => unknown } };
        if (!w.WebChat) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdn.botframework.com/botframework-webchat/4.18.0/webchat.js";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Could not load Web Chat"));
            document.body.appendChild(s);
          });
        }
        const { token } = await api<{ token: string }>("/api/navobot/token");
        if (cancelled || !el.current || !w.WebChat) return;
        w.WebChat.renderWebChat({
          directLine: w.WebChat.createDirectLine({ token }),
          locale: lang === "fil" ? "fil-PH" : "en-US",
          styleOptions: { accent: "#1f416a", bubbleBorderRadius: 12, bubbleFromUserBackground: "#dbe6f2", hideUploadButton: true },
        }, el.current);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [lang]);
  return error ? <p className="p-4 text-sm text-red-600">{error}</p> : <div ref={el} className="h-full" />;
}

function DemoChat() {
  const { t, lang } = useCitizen();
  const [msgs, setMsgs] = useState<Msg[]>([{
    from: "bot",
    text: lang === "fil" ? "Kumusta! Ako si NavoBot. Itanong mo ang tungkol sa baha, permit, ruta, o barangay." : "Hi! I'm NavoBot. Ask me about floods, permits, transit routes, or barangays.",
    suggestions: lang === "fil" ? ["May baha ba ngayon?", "Paano mag-report ng basura?", "Jeep papuntang Divisoria"] : ["Any flood advisory?", "How do I report illegal parking?", "Jeepney to Divisoria"],
  }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  async function send(m: string) {
    if (!m.trim()) return;
    setMsgs((x) => [...x, { from: "me", text: m }]);
    setText("");
    setBusy(true);
    try {
      const r = await api<{ text: string; action?: string; suggestions?: string[] }>("/api/navobot/demo-chat", { body: { message: m } });
      setMsgs((x) => [...x, { from: "bot", ...r }]);
    } catch {
      setMsgs((x) => [...x, { from: "bot", text: lang === "fil" ? "Walang koneksyon. Para sa emergency, tumawag sa 911." : "No connection. For emergencies call 911." }]);
    } finally {
      setBusy(false);
    }
  }
  const actionHref: Record<string, string> = { sos: "/app/sos", report: "/app/report", transport: "/app/transport", directory: "/app/directory" };
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {msgs.map((m, i) => (
          <div key={i} className={cx("flex", m.from === "me" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2 text-sm", m.from === "me" ? "bg-navy-700 text-white" : "bg-white shadow-sm ring-1 ring-slate-200")}>
              {m.text}
              {m.action && actionHref[m.action] && (
                <Link href={actionHref[m.action]!} className={cx("mt-2 block rounded-xl py-2 text-center text-sm font-semibold text-white", m.action === "sos" ? "bg-red-600" : "bg-navy-700")}>
                  {m.action === "sos" ? "SOS" : m.action === "report" ? t("report") : m.action === "transport" ? t("transport") : t("directory")}
                </Link>
              )}
              {m.suggestions && i === msgs.length - 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.suggestions.filter((s) => s !== "SOS").map((s) => <button key={s} onClick={() => send(s)} className="rounded-full bg-navy-50 px-2.5 py-1 text-xs text-navy-800 ring-1 ring-navy-100">{s}</button>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400">NavoBot…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex gap-2 border-t bg-white p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("chatPlaceholder")} className="flex-1 rounded-full border border-slate-300 px-4 py-2" />
        <button className="rounded-full bg-navy-700 p-2.5 text-white" aria-label="Send"><Send size={18} /></button>
      </form>
    </div>
  );
}

export default function ChatPage() {
  const { t, config, lang } = useCitizen();
  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col">
      <div className="flex items-start gap-2 bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" /> {t("chatDisclaimer")}
      </div>
      <div className="min-h-0 flex-1">
        {config?.navobot.mode === "directline" ? <CopilotWebChat lang={lang} /> : <DemoChat />}
      </div>
    </div>
  );
}
