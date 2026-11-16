import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

export const GET = route(async (req) => {
  await requireUser(req, "audit.read");
  const sp = new URL(req.url).searchParams;
  const rows = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.before, a.after, a.ip, a.created_at, u.full_name AS actor, u.role AS actor_role
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     WHERE ($1::text IS NULL OR a.action LIKE $1 || '%') ORDER BY a.created_at DESC LIMIT 500`, [sp.get("action")]);
  return json({ logs: rows });
});
