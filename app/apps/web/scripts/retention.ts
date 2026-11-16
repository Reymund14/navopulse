/**
 * Data retention job (RA 10173: keep personal data no longer than needed).
 * Run daily, e.g. cron: 30 2 * * *  pnpm --filter @navopulse/web tsx scripts/retention.ts
 *
 * Periods are defaults for the prototype; the city's Data Protection Officer
 * and records officer must confirm them (see docs/07-security-privacy.md).
 */
import { pool } from "../src/lib/db";

const RULES: { name: string; sql: string }[] = [
  { name: "OTP codes older than 1 day", sql: `DELETE FROM otp_codes WHERE created_at < now() - interval '1 day'` },
  { name: "expired or revoked sessions older than 30 days", sql: `DELETE FROM sessions WHERE (expires_at < now() OR revoked_at IS NOT NULL) AND created_at < now() - interval '30 days'` },
  { name: "SMS bodies older than 1 year (keep metadata)", sql: `UPDATE sms_messages SET body = '[redacted after retention period]' WHERE created_at < now() - interval '1 year' AND body <> '[redacted after retention period]'` },
  { name: "in-app notifications older than 1 year", sql: `DELETE FROM notifications WHERE created_at < now() - interval '1 year'` },
  {
    name: "reporter contact on closed incidents older than 3 years",
    sql: `UPDATE incidents SET reporter_name_enc = NULL, reporter_mobile_enc = NULL, reporter_mobile_hash = NULL
          WHERE status IN ('resolved','rejected','duplicate') AND COALESCE(resolved_at, updated_at) < now() - interval '3 years'
            AND (reporter_name_enc IS NOT NULL OR reporter_mobile_enc IS NOT NULL)`,
  },
  { name: "device tokens unused for 1 year", sql: `DELETE FROM device_tokens WHERE last_seen_at < now() - interval '1 year'` },
];

async function main() {
  const db = pool();
  for (const r of RULES) {
    const res = await db.query(r.sql);
    console.log(`${r.name}: ${res.rowCount ?? 0} row(s)`);
  }
  await db.query(`INSERT INTO audit_logs (action, entity, after) VALUES ('retention.run', 'system', $1)`, [JSON.stringify({ at: new Date().toISOString() })]);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
