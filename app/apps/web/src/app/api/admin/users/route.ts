import { userAdminSchema } from "@navopulse/shared";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { ApiError, json, parseBody, route } from "@/lib/http";

export const GET = route(async (req) => {
  await requireUser(req, "users.manage");
  const rows = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.last_login_at, u.created_at, r.name AS unit,
            (u.mobile_hash IS NOT NULL) AS has_mobile
     FROM users u LEFT JOIN response_units r ON r.id = u.unit_id
     ORDER BY (u.role = 'citizen'), u.role, u.full_name LIMIT 1000`);
  return json({ users: rows });
});

const createSchema = userAdminSchema.extend({ password: z.string().min(10).max(200), unitId: z.uuid().optional() });

export const POST = route(async (req) => {
  const admin = await requireUser(req, "users.manage");
  const body = await parseBody(req, createSchema);
  if (body.role === "citizen") throw new ApiError(400, "Citizens register themselves in the app");
  const exists = await queryOne(`SELECT 1 FROM users WHERE email = $1`, [body.email]);
  if (exists) throw new ApiError(409, "A user with that email already exists");
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (role, full_name, email, password_hash, is_active, is_verified, unit_id, preferred_language)
     VALUES ($1,$2,$3,$4,$5,true,$6,'en') RETURNING id`,
    [body.role, body.fullName, body.email, await bcrypt.hash(body.password, 12), body.isActive, body.unitId ?? null]);
  await audit(req, admin.id, "user.create", "user", row!.id, null, { email: body.email, role: body.role });
  return json({ id: row!.id }, 201);
});
