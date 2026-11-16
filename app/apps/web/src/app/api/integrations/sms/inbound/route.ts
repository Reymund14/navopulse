import { NAVOTAS_BOUNDS, parseSosSms, SOS_CATEGORY_CODE } from "@navopulse/shared";
import { encrypt, lookupHash, safeEqual } from "@/lib/crypto";
import { query, queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, json, rateLimit, route } from "@/lib/http";
import { createIncident } from "@/lib/incidents";
import { sendSms } from "@/lib/notifications";

/**
 * Inbound SMS webhook for the offline SOS fallback.
 * Accepts JSON {from, body, messageId, provider} or Twilio-style form posts
 * (From, Body, MessageSid). Authenticate with header X-Webhook-Secret or
 * ?secret= (for providers that cannot set headers).
 */
export const POST = route(async (req) => {
  const url = new URL(req.url);
  const secret = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (!safeEqual(secret, env.smsInboundSecret)) throw new ApiError(401, "Invalid webhook secret");

  let from = "";
  let body = "";
  let messageId: string | null = null;
  let provider = url.searchParams.get("provider") ?? env.smsProvider;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await req.json()) as Record<string, unknown>;
    from = String(j.from ?? j.mobile_number ?? "");
    body = String(j.body ?? j.message ?? j.text ?? "");
    messageId = j.messageId ? String(j.messageId) : null;
    if (j.provider) provider = String(j.provider);
  } else {
    const f = await req.formData();
    from = String(f.get("From") ?? f.get("from") ?? "");
    body = String(f.get("Body") ?? f.get("body") ?? f.get("message") ?? "");
    messageId = (f.get("MessageSid") ?? f.get("messageId")) as string | null;
  }
  from = from.replace(/[\s()-]/g, "").replace(/^09/, "+639").replace(/^639/, "+639");
  if (!from || !body) throw new ApiError(400, "Missing sender or body");
  rateLimit(`sms-in:${from}`, 10, 10 * 60_000);

  if (messageId) {
    const dup = await queryOne<{ parsed_incident_id: string | null }>(
      `SELECT parsed_incident_id FROM sms_messages WHERE provider = $1 AND provider_message_id = $2`, [provider, messageId]);
    if (dup) return json({ ok: true, duplicate: true, incidentId: dup.parsed_incident_id });
  }

  let parsed = parseSosSms(body);
  if (parsed.ok) {
    const { lat, lng } = parsed.payload;
    const b = NAVOTAS_BOUNDS;
    if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) parsed = { ok: false, error: "Coordinates outside Navotas City" };
  }
  const log = await queryOne<{ id: string }>(
    `INSERT INTO sms_messages (direction, phone_number_enc, phone_hash, body, provider, provider_message_id, status, parse_error)
     VALUES ('inbound', $1, $2, $3, $4, $5, 'received', $6) RETURNING id`,
    [encrypt(from), lookupHash(from), body.slice(0, 1000), provider, messageId, parsed.ok ? null : parsed.error]);

  if (!parsed.ok) {
    if (/^\s*nvp/i.test(body)) {
      await sendSms(from, "NavoPulse: We could not read your SOS message. If this is an emergency, call 911 now.", { kind: "sms_parse_error" });
    }
    return json({ ok: false, error: parsed.error }, 200);
  }

  const p = parsed.payload;
  const reporter = await queryOne<{ id: string }>(`SELECT id FROM users WHERE mobile_hash = $1 AND role = 'citizen'`, [lookupHash(from)]);
  const result = await createIncident({
    clientId: p.clientRef ?? null,
    categoryCode: SOS_CATEGORY_CODE[p.type],
    description: p.note ?? "SOS via SMS (offline fallback)",
    lat: p.lat, lng: p.lng,
    locationSource: "sms",
    peopleAffected: p.peopleAffected,
    source: "sms",
    reporterId: reporter?.id ?? null,
    reporterMobile: from,
  });
  await query(`UPDATE sms_messages SET parsed_incident_id = $2, status = 'parsed' WHERE id = $1`, [log!.id, result.id]);
  if (result.created) {
    await sendSms(from, `NavoPulse: SOS received. Control no. ${result.controlNumber}. Help is being dispatched. Stay safe; call 911 if your situation gets worse.`, {
      userId: reporter?.id, kind: "sms_ack", incidentId: result.id,
    });
  }
  return json({ ok: true, created: result.created, incidentId: result.id, controlNumber: result.controlNumber });
});
