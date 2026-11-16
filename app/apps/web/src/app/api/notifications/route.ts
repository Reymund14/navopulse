import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

/** Notification delivery log for the dashboard. */
export const GET = route(async (req) => {
  await requireUser(req, "notifications.read");
  const sp = new URL(req.url).searchParams;
  const rows = await query(
    `SELECT n.id, n.channel, n.kind, n.status, n.error, n.created_at, n.sent_at, n.payload->>'title' AS title,
            COALESCE(n.payload->>'body', '') AS body, i.control_number, a.title AS advisory, u.full_name AS recipient
     FROM notifications n LEFT JOIN incidents i ON i.id = n.incident_id LEFT JOIN advisories a ON a.id = n.advisory_id
     LEFT JOIN users u ON u.id = n.user_id
     WHERE ($1::text IS NULL OR n.channel = $1) AND n.kind <> 'otp'
     ORDER BY n.created_at DESC LIMIT 300`, [sp.get("channel")]);
  return json({ notifications: rows });
});
