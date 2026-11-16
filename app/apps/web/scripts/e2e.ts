/**
 * End-to-end check against a running server (dev or staging):
 * three intake channels (citizen app, offline SMS, NavoBot webhook) →
 * live SSE event → verify → assign → responder resolves with photo →
 * citizen notified → rating → analytics/export.
 *
 *   BASE_URL=http://localhost:3000 pnpm --filter @navopulse/web e2e
 *
 * Needs dev-mode OTP (devCode in the response) and the default dev webhook
 * secrets, or set NAVOBOT_WEBHOOK_SECRET / SMS_INBOUND_SECRET to match.
 */
import { createHmac, randomUUID } from "node:crypto";
import { encodeSosSms } from "@navopulse/shared";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const NAVOBOT_SECRET = process.env.NAVOBOT_WEBHOOK_SECRET ?? "dev-navobot-secret";
const SMS_SECRET = process.env.SMS_INBOUND_SECRET ?? "dev-sms-inbound-secret";
const PASSWORD = process.env.DEMO_PASSWORD ?? "NavoPulse!2026";

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? "✔" : "✘"} ${name}${!ok && extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  if (!ok) failures++;
}

async function call<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown; token?: string; headers?: Record<string, string>; raw?: BodyInit } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body || opts.raw ? "POST" : "GET"),
    headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...opts.headers },
    body: opts.raw ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  return { status: res.status, data: data as T };
}

async function staffToken(email: string) {
  const r = await call<{ token: string }>("/api/auth/login", { body: { email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

/** Open the SSE stream and resolve with the first incident event matching `pred`. */
function waitForEvent(token: string, pred: (e: { id: string; op: string }) => boolean, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const p = (async () => {
    const res = await fetch(`${BASE}/api/incidents/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return null;
      buf += dec.decode(value, { stream: true });
      for (const chunk of buf.split("\n\n").slice(0, -1)) {
        const ev = /event: incident\ndata: (.*)/.exec(chunk);
        if (ev) {
          const e = JSON.parse(ev[1]!);
          if (pred(e)) return e;
        }
      }
      buf = buf.slice(buf.lastIndexOf("\n\n") + 2);
    }
  })();
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  return { result: Promise.race([p.catch(() => null), timeout]).finally(() => ctrl.abort()) };
}

async function main() {
  console.log(`E2E against ${BASE}\n`);
  check("health", (await call("/api/health")).status === 200);

  // ---------------------------------------------------------------- citizen app
  const mobile = `0917${String(Math.floor(Math.random() * 9e6) + 1e6)}`;
  const otp = await call<{ devCode?: string }>("/api/auth/otp/request", { body: { mobileNumber: mobile } });
  check("OTP requested", otp.status === 200 && !!otp.data.devCode, otp.data);
  const needsReg = await call("/api/auth/otp/verify", { body: { mobileNumber: mobile, code: otp.data.devCode } });
  check("new number must accept the privacy notice", needsReg.status === 400);
  const reg = await call<{ token: string; isNew: boolean }>("/api/auth/otp/verify", {
    body: { mobileNumber: mobile, code: otp.data.devCode, fullName: "E2E Resident", privacyConsent: true, preferredLanguage: "en" },
  });
  check("citizen registered with consent", reg.status === 200 && reg.data.isNew, reg.data);
  const citizen = reg.data.token;
  await call("/api/me/device-tokens", { token: citizen, body: { platform: "web", token: `e2e-device-${randomUUID()}` } });

  const dispatcher = await staffToken("dispatch@navopulse.local");
  const clientId = randomUUID();
  const live = waitForEvent(dispatcher, (e) => e.op === "INSERT");
  await new Promise((r) => setTimeout(r, 500)); // let the stream subscribe
  const sos = await call<{ id: string; controlNumber: string; created: boolean }>("/api/incidents", {
    token: citizen,
    body: { clientId, categoryCode: "EMR_FLOOD", description: "E2E: tubig hanggang tuhod", location: { lat: 14.6748, lng: 120.9372, accuracy: 12 }, peopleAffected: 4 },
  });
  check("SOS created via app", sos.status === 201 && /^NVP-EMR-/.test(sos.data.controlNumber), sos.data);
  const evt = await live.result;
  check("dashboard received live SSE event", evt?.id === sos.data.id, evt);
  const again = await call<{ id: string; created: boolean }>("/api/incidents", {
    token: citizen, body: { clientId, categoryCode: "EMR_FLOOD", location: { lat: 14.6748, lng: 120.9372 } },
  });
  check("retry with same clientId is idempotent", again.status === 200 && again.data.id === sos.data.id && !again.data.created);
  check("outside-Navotas location rejected", (await call("/api/incidents", { token: citizen, body: { clientId: randomUUID(), categoryCode: "EMR_FLOOD", location: { lat: 10.3, lng: 123.9 } } })).status === 422);

  // ---------------------------------------------------------------- offline SMS
  const smsRef = randomUUID();
  const smsBody = encodeSosSms({ type: "fire", lat: 14.6612, lng: 120.9462, peopleAffected: 2, clientRef: smsRef, note: "E2E sunog sa kanto" });
  const inbound = await call<{ controlNumber: string; created: boolean; incidentId: string }>(`/api/integrations/sms/inbound?secret=${SMS_SECRET}`, {
    body: { from: "09171234567", body: smsBody, messageId: `e2e-${smsRef}`, provider: "e2e" },
  });
  check("SMS SOS parsed into an incident", inbound.status === 200 && inbound.data.created && /^NVP-EMR-/.test(inbound.data.controlNumber), inbound.data);
  const dupSms = await call<{ duplicate?: boolean }>(`/api/integrations/sms/inbound?secret=${SMS_SECRET}`, { body: { from: "09171234567", body: smsBody, messageId: `e2e-${smsRef}`, provider: "e2e" } });
  check("redelivered SMS ignored", dupSms.data.duplicate === true);
  check("SMS webhook rejects wrong secret", (await call(`/api/integrations/sms/inbound?secret=nope`, { body: { from: "0917", body: "x" } })).status === 401);

  // ---------------------------------------------------------------- NavoBot
  const ticket = JSON.stringify({
    conversationId: `e2e-${randomUUID()}`, category: "basura", description: "E2E: Tambak ng basura sa gilid ng kanal", barangay: "tangos south",
    citizen: { name: "Bot User", mobileNumber: "0917 555 0101" }, language: "taglish",
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = `sha256=${createHmac("sha256", NAVOBOT_SECRET).update(`${ts}.${ticket}`).digest("hex")}`;
  const nb = await call<{ controlNumber: string; reply_fil: string; category: string; incidentId: string }>("/api/integrations/navobot/tickets", {
    raw: ticket, headers: { "Content-Type": "application/json", "X-NavoPulse-Timestamp": String(ts), "X-NavoPulse-Signature": sig },
  });
  check("NavoBot ticket created (HMAC)", nb.status === 201 && /^NVP-CIV-/.test(nb.data.controlNumber) && nb.data.category === "CIV_WASTE", nb.data);
  check("NavoBot reply readable by bot", typeof nb.data.reply_fil === "string" && nb.data.reply_fil.includes(nb.data.controlNumber));
  check("NavoBot webhook rejects bad signature", (await call("/api/integrations/navobot/tickets", { raw: ticket, headers: { "Content-Type": "application/json", "X-NavoPulse-Timestamp": String(ts), "X-NavoPulse-Signature": "sha256=00" } })).status === 401);

  // ---------------------------------------------------------------- dispatch → resolve
  const pio = await staffToken("pio@navopulse.local");
  const pioView = await call<{ incident: { reporter: { masked: boolean } } }>(`/api/incidents/${nb.data.incidentId}`, { token: pio });
  check("PIO sees NavoBot ticket with reporter masked", pioView.status === 200 && pioView.data.incident.reporter.masked);
  check("TMO cannot open a DRRMO incident", (await call(`/api/incidents/${sos.data.id}`, { token: await staffToken("tmo@navopulse.local") })).status === 404);
  check("citizen cannot use dashboard API", (await call("/api/incidents", { token: citizen })).status === 403);

  const dView = await call<{ incident: { reporter: { masked: boolean; name: string } } }>(`/api/incidents/${sos.data.id}`, { token: dispatcher });
  check("dispatcher sees reporter identity (access logged)", dView.status === 200 && !dView.data.incident.reporter.masked && dView.data.incident.reporter.name === "E2E Resident");
  check("dispatcher verifies", (await call(`/api/incidents/${sos.data.id}/status`, { token: dispatcher, body: { status: "verified" } })).status === 200);
  const units = await call<{ units: { id: string; name: string }[] }>("/api/units", { token: dispatcher });
  const alpha = units.data.units.find((u) => u.name === "DRRMO Rescue Team Alpha")!;
  check("dispatcher assigns Rescue Team Alpha", (await call(`/api/incidents/${sos.data.id}/assign`, { token: dispatcher, body: { unitId: alpha.id, note: "Bring life vests" } })).status === 200);

  const responder = await staffToken("responder@navopulse.local");
  check("responder starts response", (await call(`/api/incidents/${sos.data.id}/status`, { token: responder, body: { status: "in_progress" } })).status === 200);
  // 1x1 JPEG
  const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
  const fd = new FormData();
  fd.append("file", new Blob([jpeg], { type: "image/jpeg" }), "proof.jpg");
  fd.append("type", "resolution");
  const up = await call<{ media: { id: string } }>("/api/media", { token: responder, raw: fd });
  check("responder uploads resolution photo", up.status === 201, up.data);
  const fakeImg = new FormData();
  fakeImg.append("file", new Blob(["<script>alert(1)</script>"], { type: "image/jpeg" }), "x.jpg");
  check("non-image upload rejected", (await call("/api/media", { token: responder, raw: fakeImg })).status === 415);
  check("responder resolves", (await call(`/api/incidents/${sos.data.id}/resolve`, { token: responder, body: { note: "4 residents evacuated to Tangos ES", mediaIds: [up.data.media.id] } })).status === 200);

  // ---------------------------------------------------------------- citizen side
  const mine = await call<{ incident: { status: string; media: { type: string }[]; history: unknown[] } }>(`/api/me/incidents/${sos.data.id}`, { token: citizen });
  check("citizen sees resolved status + resolution photo", mine.data.incident.status === "resolved" && mine.data.incident.media.some((m) => m.type === "resolution"), mine.data);
  const inbox = await call<{ notifications: { kind: string }[] }>("/api/me/notifications", { token: citizen });
  check("citizen got the feedback request", inbox.data.notifications.some((n) => n.kind === "feedback_request"));
  check("citizen rates 5 stars", (await call(`/api/me/incidents/${sos.data.id}/feedback`, { token: citizen, body: { rating: 5, comment: "Salamat po!" } })).status === 200);

  // ---------------------------------------------------------------- reporting
  const analytics = await call<{ totals: { total: number } }>("/api/analytics/summary", { token: dispatcher });
  check("analytics summary", analytics.status === 200 && analytics.data.totals.total > 0);
  const csv = await call<string>("/api/analytics/export", { token: dispatcher });
  check("CSV export", csv.status === 200 && String(csv.data).includes("control_number"));
  const admin = await staffToken("admin@navopulse.local");
  const audit = await call<{ logs: { action: string }[] }>("/api/audit", { token: admin });
  check("audit log records the lifecycle", ["incident.assign", "incident.resolve", "pii.view"].every((a) => audit.data.logs.some((l) => l.action === a)));

  console.log(`\n${failures ? `${failures} check(s) failed` : "All checks passed"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
