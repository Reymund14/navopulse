import { otpVerifySchema } from "@navopulse/shared";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { createSession, sessionCookie } from "@/lib/auth";
import { encrypt, lookupHash } from "@/lib/crypto";
import { query, queryOne } from "@/lib/db";
import { ApiError, clientIp, parseBody, rateLimit, route } from "@/lib/http";

/**
 * Verify an OTP and sign the citizen in. First-time numbers are registered,
 * which requires consent to the privacy notice (RA 10173).
 */
export const POST = route(async (req) => {
  const body = await parseBody(req, otpVerifySchema);
  rateLimit(`otp-verify:${clientIp(req) ?? "unknown"}`, 20, 15 * 60_000);
  const hash = lookupHash(body.mobileNumber);
  const otp = await queryOne<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM otp_codes WHERE mobile_hash = $1 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`, [hash]);
  if (!otp || otp.attempts >= 5) throw new ApiError(401, "Code expired. Request a new one.");
  if (!(await bcrypt.compare(body.code, otp.code_hash))) {
    await query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
    throw new ApiError(401, "Incorrect code");
  }
  let user = await queryOne<{ id: string; role: string; full_name: string | null; is_active: boolean }>(
    `SELECT id, role, full_name, is_active FROM users WHERE mobile_hash = $1`, [hash]);
  // Leave the code unconsumed so the same code works once the form is completed.
  if (!user && !body.privacyConsent) throw new ApiError(400, "Please accept the privacy notice to register", { needsRegistration: true });
  if (user && user.role !== "citizen") throw new ApiError(403, "Staff accounts sign in with email and password");
  await query(`UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [otp.id]);

  let isNew = false;
  if (!user) {
    user = await queryOne(
      `INSERT INTO users (role, full_name, mobile_number_enc, mobile_hash, barangay_id, preferred_language, is_verified, privacy_consent_at)
       VALUES ('citizen', $1, $2, $3, $4, $5, true, now()) RETURNING id, role, full_name, is_active`,
      [body.fullName ?? null, encrypt(body.mobileNumber), hash, body.barangayId ?? null, body.preferredLanguage ?? "fil"]);
    isNew = true;
    await audit(req, user!.id, "citizen.register", "user", user!.id, null, { consent: true });
  }
  if (!user!.is_active) throw new ApiError(403, "This account is disabled. Contact the PIO.");
  const { token, expires } = await createSession(user!.id, "citizen", { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ user: { id: user!.id, role: "citizen", fullName: user!.full_name }, isNew, token });
  res.cookies.set(sessionCookie(token, expires));
  return res;
});
