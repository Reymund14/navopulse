import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@navopulse/shared";
import { env } from "./env";
import { query, queryOne } from "./db";
import { ApiError } from "./http";
import { can, type Permission } from "./rbac";

export const SESSION_COOKIE = "np_session";
const STAFF_TTL_H = 12;
const CITIZEN_TTL_H = 24 * 30;

export interface SessionUser {
  id: string;
  sessionId: string;
  role: Role;
  fullName: string | null;
  email: string | null;
  barangayId: string | null;
  unitId: string | null;
  preferredLanguage: "en" | "fil";
}

const secret = () => new TextEncoder().encode(env.sessionSecret);

export async function createSession(userId: string, role: Role, meta: { ip?: string | null; userAgent?: string | null }) {
  const ttlH = role === "citizen" ? CITIZEN_TTL_H : STAFF_TTL_H;
  const expires = new Date(Date.now() + ttlH * 3600_000);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO sessions (user_id, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, expires, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
  );
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
  const token = await new SignJWT({ sid: row!.id, role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret());
  return { token, expires };
}

export function sessionCookie(token: string, expires: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Resolve a session token (cookie or Bearer) to an active user, or null. */
export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const sid = payload.sid as string | undefined;
    if (!sid || !payload.sub) return null;
    const row = await queryOne<{
      id: string; role: Role; full_name: string | null; email: string | null; barangay_id: string | null;
      unit_id: string | null; preferred_language: "en" | "fil";
    }>(
      `SELECT u.id, u.role, u.full_name, u.email, u.barangay_id, u.unit_id, u.preferred_language
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND u.id = $2 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active`,
      [sid, payload.sub],
    );
    if (!row) return null;
    return {
      id: row.id, sessionId: sid, role: row.role, fullName: row.full_name, email: row.email,
      barangayId: row.barangay_id, unitId: row.unit_id, preferredLanguage: row.preferred_language,
    };
  } catch {
    return null;
  }
}

function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function getUser(req: Request): Promise<SessionUser | null> {
  return userFromToken(tokenFromRequest(req));
}

/** Throws 401/403 unless the caller is signed in and holds the permission. */
export async function requireUser(req: Request, permission?: Permission | Permission[]): Promise<SessionUser> {
  const user = await getUser(req);
  if (!user) throw new ApiError(401, "Sign in required");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => can(user.role, p))) throw new ApiError(403, "You do not have access to this action");
  }
  return user;
}

export async function revokeSession(sessionId: string) {
  await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
}
