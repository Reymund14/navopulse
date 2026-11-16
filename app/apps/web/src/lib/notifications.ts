import { STATUS_LABELS, type IncidentStatus } from "@navopulse/shared";
import { decrypt, encrypt, lookupHash } from "./crypto";
import { query, queryOne } from "./db";
import { pushProvider, type PushMessage } from "./providers/push";
import { smsProvider } from "./providers/sms";

/**
 * Notification engine. Every attempt is written to `notifications` (the
 * notification log in the dashboard), and every SMS to `sms_messages`.
 */

export async function sendSms(to: string, body: string, opts: { userId?: string | null; kind: string; incidentId?: string | null; advisoryId?: string | null }) {
  const provider = smsProvider();
  const result = await provider.send(to, body);
  // Never keep one-time codes in the logs.
  if (opts.kind === "otp") body = body.replace(/\d{6}/g, "******");
  await query(
    `INSERT INTO sms_messages (direction, phone_number_enc, phone_hash, body, provider, provider_message_id, status, parsed_incident_id)
     VALUES ('outbound', $1, $2, $3, $4, $5, $6, $7)`,
    [encrypt(to), lookupHash(to), body, provider.name, result.providerMessageId, result.status, opts.incidentId ?? null],
  );
  await query(
    `INSERT INTO notifications (user_id, channel, kind, payload, status, error, incident_id, advisory_id, sent_at)
     VALUES ($1, 'sms', $2, $3, $4, $5, $6, $7, now())`,
    [opts.userId ?? null, opts.kind, JSON.stringify({ body }), result.status === "sent" ? "sent" : "failed", result.error ?? null, opts.incidentId ?? null, opts.advisoryId ?? null],
  );
  return result.status === "sent";
}

async function pushToUser(userId: string, msg: PushMessage, kind: string, refs: { incidentId?: string | null; advisoryId?: string | null }) {
  const tokens = await query<{ token: string }>(`SELECT token FROM device_tokens WHERE user_id = $1`, [userId]);
  if (tokens.length === 0) return false;
  const results = await pushProvider().send(tokens.map((t) => t.token), msg);
  const anyOk = results.some((r) => r.ok);
  const dead = results.filter((r) => r.unregistered).map((r) => r.token);
  if (dead.length) await query(`DELETE FROM device_tokens WHERE token = ANY($1)`, [dead]);
  await query(
    `INSERT INTO notifications (user_id, channel, kind, payload, status, error, incident_id, advisory_id, sent_at)
     VALUES ($1, 'push', $2, $3, $4, $5, $6, $7, now())`,
    [userId, kind, JSON.stringify(msg), anyOk ? "sent" : "failed", anyOk ? null : results.map((r) => r.error).filter(Boolean).join("; ") || null, refs.incidentId ?? null, refs.advisoryId ?? null],
  );
  return anyOk;
}

async function inApp(userId: string, msg: PushMessage, kind: string, refs: { incidentId?: string | null; advisoryId?: string | null }) {
  await query(
    `INSERT INTO notifications (user_id, channel, kind, payload, status, incident_id, advisory_id, sent_at) VALUES ($1, 'in_app', $2, $3, 'delivered', $4, $5, now())`,
    [userId, kind, JSON.stringify(msg), refs.incidentId ?? null, refs.advisoryId ?? null],
  );
}

/**
 * Tell the reporter their case changed. In-app always; push if they have a
 * device registered; SMS if push is unavailable or failed (covers SMS and
 * NavoBot reporters without accounts, and citizens without data).
 */
export async function notifyIncidentStatus(incidentId: string, status: IncidentStatus, extra?: string) {
  const inc = await queryOne<{
    id: string; control_number: string; reporter_id: string | null; reporter_mobile_enc: string | null;
    user_mobile_enc: string | null; lang: "en" | "fil" | null;
  }>(
    `SELECT i.id, i.control_number, i.reporter_id, i.reporter_mobile_enc, u.mobile_number_enc AS user_mobile_enc, u.preferred_language AS lang
     FROM incidents i LEFT JOIN users u ON u.id = i.reporter_id WHERE i.id = $1`,
    [incidentId],
  );
  if (!inc) return;
  const lang = inc.lang ?? "fil";
  const label = STATUS_LABELS[status][lang];
  const title = lang === "fil" ? `Update sa ulat ${inc.control_number}` : `Update on report ${inc.control_number}`;
  let body = lang === "fil" ? `Status: ${label}.` : `Status: ${label}.`;
  if (extra) body += ` ${extra}`;
  if (status === "resolved") {
    body += lang === "fil" ? " I-rate ang aming serbisyo sa NavoPulse app." : " Please rate our service in the NavoPulse app.";
  }
  const msg: PushMessage = { title, body, data: { incidentId: inc.id, controlNumber: inc.control_number, status } };
  const kind = status === "resolved" ? "feedback_request" : "status_change";

  let delivered = false;
  if (inc.reporter_id) {
    await inApp(inc.reporter_id, msg, kind, { incidentId });
    delivered = await pushToUser(inc.reporter_id, msg, kind, { incidentId });
  }
  if (!delivered) {
    const mobile = decrypt(inc.user_mobile_enc) ?? decrypt(inc.reporter_mobile_enc);
    if (mobile) await sendSms(mobile, `NavoPulse: ${title}. ${body}`.slice(0, 300), { userId: inc.reporter_id, kind, incidentId });
  }
}

/** Fan out an advisory to every citizen in the target barangays (or the whole city). */
export async function deliverAdvisory(advisoryId: string) {
  const adv = await queryOne<{ id: string; title: string; body_en: string; body_fil: string; target_barangay_ids: string[]; channels: string[]; severity: string }>(
    `SELECT id, title, body_en, body_fil, target_barangay_ids, channels, severity FROM advisories WHERE id = $1`,
    [advisoryId],
  );
  if (!adv) return 0;
  const recipients = await query<{ id: string; mobile_number_enc: string | null; preferred_language: "en" | "fil"; has_device: boolean }>(
    `SELECT u.id, u.mobile_number_enc, u.preferred_language,
            EXISTS (SELECT 1 FROM device_tokens d WHERE d.user_id = u.id) AS has_device
     FROM users u
     WHERE u.role = 'citizen' AND u.is_active
       AND (cardinality($1::uuid[]) = 0 OR u.barangay_id = ANY($1::uuid[]))`,
    [adv.target_barangay_ids],
  );
  for (const r of recipients) {
    const body = r.preferred_language === "en" ? adv.body_en : adv.body_fil;
    const msg: PushMessage = { title: `[${adv.severity.toUpperCase()}] ${adv.title}`, body, data: { advisoryId: adv.id } };
    await inApp(r.id, msg, "advisory", { advisoryId: adv.id });
    let pushed = false;
    if (adv.channels.includes("push") && r.has_device) pushed = await pushToUser(r.id, msg, "advisory", { advisoryId: adv.id });
    // SMS goes to registered numbers when requested, and as a fallback for critical alerts.
    const mobile = decrypt(r.mobile_number_enc);
    if (mobile && (adv.channels.includes("sms") || (!pushed && adv.severity === "critical"))) {
      await sendSms(mobile, `NavoPulse ${adv.severity.toUpperCase()}: ${adv.title}. ${body}`.slice(0, 320), { userId: r.id, kind: "advisory", advisoryId: adv.id });
    }
  }
  await query(`UPDATE advisories SET recipients_count = $2 WHERE id = $1`, [adv.id, recipients.length]);
  return recipients.length;
}
