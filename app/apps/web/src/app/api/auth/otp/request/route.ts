import { otpRequestSchema } from "@navopulse/shared";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { lookupHash } from "@/lib/crypto";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { clientIp, json, parseBody, rateLimit, route } from "@/lib/http";
import { sendSms } from "@/lib/notifications";

/** Send a 6-digit sign-in code to a PH mobile number. Valid for 5 minutes. */
export const POST = route(async (req) => {
  const { mobileNumber } = await parseBody(req, otpRequestSchema);
  rateLimit(`otp-ip:${clientIp(req) ?? "unknown"}`, 10, 15 * 60_000);
  rateLimit(`otp-num:${mobileNumber}`, 3, 15 * 60_000);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await query(`INSERT INTO otp_codes (mobile_hash, code_hash, expires_at) VALUES ($1, $2, now() + interval '5 minutes')`,
    [lookupHash(mobileNumber), await bcrypt.hash(code, 8)]);
  await sendSms(mobileNumber, `Your NavoPulse code is ${code}. It expires in 5 minutes. Never share this code.`, { kind: "otp" });
  // In development the code is returned so the flow can be demoed without an SMS provider.
  return json({ ok: true, expiresInSeconds: 300, ...(env.exposeOtp ? { devCode: code } : {}) });
});
