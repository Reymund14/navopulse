import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

/** NavoBot conversations that needed human follow-up or became tickets. */
export const GET = route(async (req) => {
  await requireUser(req, ["incident.manage", "analytics.read"]);
  const rows = await query(
    `SELECT q.id, q.control_number, q.channel, q.topic, q.status, q.created_at, q.conversation_id, q.transcript_ref,
            i.id AS incident_id, i.control_number AS incident_control_number
     FROM inquiries q LEFT JOIN incidents i ON i.inquiry_id = q.id ORDER BY q.created_at DESC LIMIT 300`);
  return json({ inquiries: rows });
});
