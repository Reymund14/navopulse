import { requireUser } from "@/lib/auth";
import { decrypt, maskMobile } from "@/lib/crypto";
import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

/** Inbound/outbound SMS log. Numbers are masked; OTP bodies are redacted. */
export const GET = route(async (req) => {
  await requireUser(req, "sms.read");
  const rows = await query<{ phone_number_enc: string; body: string } & Record<string, unknown>>(
    `SELECT s.id, s.direction, s.phone_number_enc, s.body, s.provider, s.status, s.parse_error, s.created_at, i.control_number, i.id AS incident_id
     FROM sms_messages s LEFT JOIN incidents i ON i.id = s.parsed_incident_id ORDER BY s.created_at DESC LIMIT 300`);
  return json({
    messages: rows.map(({ phone_number_enc, body, ...r }) => ({
      ...r,
      phone: maskMobile(decrypt(phone_number_enc)),
      body: /NavoPulse code is \d{6}/.test(body) ? "[OTP redacted]" : body,
    })),
  });
});
