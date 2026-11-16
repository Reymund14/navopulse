import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

/** The citizen's in-app inbox. POST marks all as read. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const rows = await query(
    `SELECT id, kind, payload, incident_id, advisory_id, read_at, created_at FROM notifications
     WHERE user_id = $1 AND channel = 'in_app' ORDER BY created_at DESC LIMIT 50`, [user.id]);
  return json({ notifications: rows, unread: rows.filter((r) => !r.read_at).length });
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND channel = 'in_app' AND read_at IS NULL`, [user.id]);
  return json({ ok: true });
});
