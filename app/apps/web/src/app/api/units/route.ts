import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { json, parseBody, route } from "@/lib/http";
import { officeScope } from "@/lib/rbac";

export const GET = route(async (req) => {
  const user = await requireUser(req, "units.read");
  const office = officeScope(user.role);
  const rows = await query(
    `SELECT u.id, u.name, u.office, u.type, u.contact, u.is_available, ST_Y(u.current_location) AS lat, ST_X(u.current_location) AS lng,
            (SELECT count(*)::int FROM incidents i WHERE i.assigned_unit_id = u.id AND i.status IN ('assigned','in_progress')) AS active_incidents
     FROM response_units u WHERE ($1::text IS NULL OR u.office = $1) ORDER BY u.office, u.name`,
    [office === "DRRMO" || office === "TMO" ? office : null]);
  return json({ units: rows });
});

const unitSchema = z.object({
  name: z.string().trim().min(2).max(100),
  office: z.enum(["DRRMO", "TMO"]),
  type: z.string().trim().min(2).max(60),
  contact: z.string().trim().max(100).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser(req, "units.manage");
  const body = await parseBody(req, unitSchema);
  const row = await queryOne(`INSERT INTO response_units (name, office, type, contact) VALUES ($1,$2,$3,$4) RETURNING *`,
    [body.name, body.office, body.type, body.contact ?? null]);
  await audit(req, user.id, "unit.create", "response_unit", row!.id as string, null, body);
  return json({ unit: row }, 201);
});
