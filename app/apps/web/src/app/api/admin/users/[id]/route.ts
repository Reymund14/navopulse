import { ROLES } from "@navopulse/shared";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { ApiError, json, parseBody, route } from "@/lib/http";
import { uuidParam } from "@/lib/params";

const patchSchema = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
  unitId: z.uuid().nullable().optional(),
});

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const admin = await requireUser(req, "users.manage");
  const id = uuidParam((await params).id);
  const body = await parseBody(req, patchSchema);
  if (id === admin.id && (body.isActive === false || (body.role && body.role !== "super_admin"))) {
    throw new ApiError(400, "You cannot demote or disable your own account");
  }
  const before = await queryOne<{ role: string; is_active: boolean }>(`SELECT role, is_active, unit_id FROM users WHERE id = $1`, [id]);
  if (!before) throw new ApiError(404, "User not found");
  if (body.role && (before.role === "citizen") !== (body.role === "citizen")) throw new ApiError(400, "Cannot convert between citizen and staff accounts");
  await query(
    `UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active),
       password_hash = COALESCE($4, password_hash), unit_id = CASE WHEN $5::boolean THEN $6::uuid ELSE unit_id END WHERE id = $1`,
    [id, body.role ?? null, body.isActive ?? null, body.password ? await bcrypt.hash(body.password, 12) : null, body.unitId !== undefined, body.unitId ?? null]);
  // Disabling or changing a role ends existing sessions.
  if (body.isActive === false || body.role || body.password) await query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
  await audit(req, admin.id, "user.update", "user", id, before, { ...body, password: body.password ? "[changed]" : undefined });
  return json({ ok: true });
});
