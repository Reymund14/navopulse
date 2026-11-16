import { STAFF_ROLES, staffLoginSchema, type Role } from "@navopulse/shared";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { createSession, sessionCookie } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { ApiError, clientIp, parseBody, rateLimit, route } from "@/lib/http";

// Compared against for unknown emails so they take as long as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync("navopulse-timing-equaliser", 10);

/** Staff sign-in for the LGU Web Command Dashboard. */
export const POST = route(async (req) => {
  const ip = clientIp(req) ?? "unknown";
  rateLimit(`login:${ip}`, 10, 5 * 60_000);
  const { email, password } = await parseBody(req, staffLoginSchema);
  const user = await queryOne<{ id: string; role: Role; password_hash: string | null; is_active: boolean; full_name: string }>(
    `SELECT id, role, password_hash, is_active, full_name FROM users WHERE email = $1`, [email]);
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.is_active || !STAFF_ROLES.includes(user.role)) {
    await audit(req, user?.id ?? null, "auth.login_failed", "user", user?.id ?? null, null, { email });
    throw new ApiError(401, "Incorrect email or password");
  }
  const { token, expires } = await createSession(user.id, user.role, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  await audit(req, user.id, "auth.login", "user", user.id);
  const res = NextResponse.json({ user: { id: user.id, role: user.role, fullName: user.full_name }, token });
  res.cookies.set(sessionCookie(token, expires));
  return res;
});
