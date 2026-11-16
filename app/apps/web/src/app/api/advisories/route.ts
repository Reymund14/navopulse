import { advisorySchema } from "@navopulse/shared";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { json, parseBody, rateLimit, route } from "@/lib/http";
import { deliverAdvisory } from "@/lib/notifications";

export const GET = route(async (req) => {
  await requireUser(req, ["broadcast.send", "analytics.read"]);
  const rows = await query(
    `SELECT a.id, a.title, a.body_en, a.body_fil, a.severity, a.channels, a.sent_at, a.expires_at, a.recipients_count,
            u.full_name AS sent_by,
            COALESCE((SELECT array_agg(b.name ORDER BY b.name) FROM barangays b WHERE b.id = ANY(a.target_barangay_ids)), '{}') AS barangays
     FROM advisories a LEFT JOIN users u ON u.id = a.sent_by ORDER BY a.sent_at DESC LIMIT 100`);
  return json({ advisories: rows });
});

/** Broadcast an advisory to all citizens or selected barangays, by push and/or SMS. */
export const POST = route(async (req) => {
  const user = await requireUser(req, "broadcast.send");
  rateLimit(`broadcast:${user.id}`, 10, 10 * 60_000);
  const body = await parseBody(req, advisorySchema);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO advisories (title, body_en, body_fil, severity, target_barangay_ids, channels, sent_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '2 days') RETURNING id`,
    [body.title, body.bodyEn, body.bodyFil, body.severity, body.barangayIds, body.channels, user.id]);
  const count = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM users WHERE role = 'citizen' AND is_active AND (cardinality($1::uuid[]) = 0 OR barangay_id = ANY($1::uuid[]))`, [body.barangayIds]);
  // Fan-out runs after the response so a city-wide alert does not hold the request open.
  void deliverAdvisory(row!.id).catch((e) => console.error("[advisory] delivery failed", e));
  await audit(req, user.id, "advisory.broadcast", "advisory", row!.id, null, { ...body, recipients: count!.n });
  return json({ id: row!.id, recipients: count!.n }, 201);
});
