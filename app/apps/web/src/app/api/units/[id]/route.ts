import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { ApiError, json, parseBody, route } from "@/lib/http";
import { uuidParam } from "@/lib/params";

const patchSchema = z.object({
  isAvailable: z.boolean().optional(),
  contact: z.string().trim().max(100).optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, ["units.manage", "incident.respond"]);
  const id = uuidParam((await params).id);
  if (user.role === "field_responder" && user.unitId !== id) throw new ApiError(403, "You can only update your own unit");
  const body = await parseBody(req, patchSchema);
  const before = await queryOne(`SELECT is_available, contact FROM response_units WHERE id = $1`, [id]);
  if (!before) throw new ApiError(404, "Unit not found");
  const row = await queryOne(
    `UPDATE response_units SET is_available = COALESCE($2, is_available), contact = COALESCE($3, contact),
       current_location = COALESCE(ST_SetSRID(ST_MakePoint($5, $4), 4326), current_location)
     WHERE id = $1 RETURNING id, name, is_available, contact`,
    [id, body.isAvailable ?? null, body.contact ?? null, body.location?.lat ?? null, body.location?.lng ?? null]);
  await audit(req, user.id, "unit.update", "response_unit", id, before, body);
  return json({ unit: row });
});
