import type { Role } from "@navopulse/shared";
import type { SessionUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export async function staff(email: string): Promise<SessionUser> {
  const u = await queryOne<{ id: string; role: Role; full_name: string; unit_id: string | null }>(
    `SELECT id, role, full_name, unit_id FROM users WHERE email = $1`, [email]);
  if (!u) throw new Error(`no user ${email}`);
  return { id: u.id, sessionId: "test", role: u.role, fullName: u.full_name, email, barangayId: null, unitId: u.unit_id, preferredLanguage: "en" };
}

export async function citizen(mobileIndex = 1): Promise<SessionUser> {
  const u = await queryOne<{ id: string }>(`SELECT id FROM users WHERE role = 'citizen' ORDER BY full_name LIMIT 1 OFFSET $1`, [mobileIndex - 1]);
  return { id: u!.id, sessionId: "test", role: "citizen", fullName: "Test Citizen", email: null, barangayId: null, unitId: null, preferredLanguage: "fil" };
}

export const fakeReq = (headers: Record<string, string> = {}) => new Request("http://test.local/api", { headers });
