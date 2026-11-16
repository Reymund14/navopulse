import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

/** Active advisories. ?barangayId= limits to city-wide plus that barangay. */
export const GET = route(async (req) => {
  const barangayId = new URL(req.url).searchParams.get("barangayId");
  const rows = await query(
    `SELECT a.id, a.title, a.body_en, a.body_fil, a.severity, a.sent_at, a.expires_at,
            COALESCE((SELECT array_agg(b.name ORDER BY b.name) FROM barangays b WHERE b.id = ANY(a.target_barangay_ids)), '{}') AS barangays
     FROM advisories a
     WHERE (a.expires_at IS NULL OR a.expires_at > now()) AND a.sent_at > now() - interval '14 days'
       AND (cardinality(a.target_barangay_ids) = 0 OR $1::uuid IS NULL OR $1::uuid = ANY(a.target_barangay_ids))
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'advisory' THEN 2 ELSE 3 END, a.sent_at DESC
     LIMIT 50`, [barangayId && /^[0-9a-f-]{36}$/i.test(barangayId) ? barangayId : null]);
  return json({ advisories: rows });
});
