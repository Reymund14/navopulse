import type { SessionUser } from "./auth";
import { query, queryOne } from "./db";
import { scopeSql } from "./incidents";

export interface Range {
  from: string; // YYYY-MM-DD (Manila)
  to: string;
}

export function defaultRange(sp: URLSearchParams): Range {
  const iso = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const to = sp.get("to") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("to")!) ? sp.get("to")! : iso(new Date());
  const from = sp.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from")!) ? sp.get("from")! : iso(new Date(Date.now() - 29 * 86400_000));
  return { from, to };
}

/** WHERE clause shared by every analytics query: role scope + Manila date range. */
function base(user: SessionUser, r: Range) {
  const params: unknown[] = [r.from, r.to];
  const scope = scopeSql(user, params);
  return {
    params,
    where: `i.created_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Manila'
            AND i.created_at < (($2::date) + 1)::timestamp AT TIME ZONE 'Asia/Manila' AND ${scope}`,
  };
}

const FROM = `FROM incidents i JOIN incident_categories c ON c.id = i.category_id LEFT JOIN barangays b ON b.id = i.barangay_id`;

export async function analyticsSummary(user: SessionUser, r: Range) {
  const { params, where } = base(user, r);
  const [totals, byStatus, byCategory, byBarangay, bySource, daily, times, satisfaction, ratingDist, inquiries] = await Promise.all([
    queryOne(`SELECT count(*)::int AS total,
                     count(*) FILTER (WHERE i.status NOT IN ('resolved','rejected','duplicate'))::int AS open,
                     count(*) FILTER (WHERE i.status = 'resolved')::int AS resolved,
                     count(*) FILTER (WHERE i.module = 'emergency')::int AS emergencies,
                     count(*) FILTER (WHERE i.source = 'navobot')::int AS navobot_tickets
              ${FROM} WHERE ${where}`, params),
    query(`SELECT i.status, count(*)::int AS count ${FROM} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, params),
    query(`SELECT c.code, c.name_en AS name, c.module, c.color, count(*)::int AS count ${FROM} WHERE ${where} GROUP BY 1,2,3,4 ORDER BY 5 DESC`, params),
    query(`SELECT COALESCE(b.name, 'Unknown') AS barangay, count(*)::int AS count,
                  count(*) FILTER (WHERE i.module = 'emergency')::int AS emergencies
           ${FROM} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, params),
    query(`SELECT i.source, count(*)::int AS count ${FROM} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, params),
    query(`SELECT to_char(i.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day,
                  count(*)::int AS total,
                  count(*) FILTER (WHERE i.module = 'emergency')::int AS emergency,
                  count(*) FILTER (WHERE i.module = 'civic')::int AS civic,
                  count(*) FILTER (WHERE i.module = 'traffic')::int AS traffic,
                  count(*) FILTER (WHERE i.source = 'navobot')::int AS navobot
           ${FROM} WHERE ${where} GROUP BY 1 ORDER BY 1`, params),
    // Response = report to first action (verified or assigned); resolution = report to resolved.
    query(`SELECT i.module,
                  round(avg(extract(epoch FROM COALESCE(i.verified_at, i.assigned_at) - i.created_at) / 60)::numeric, 1)::float AS avg_response_min,
                  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM COALESCE(i.verified_at, i.assigned_at) - i.created_at) / 60))::numeric, 1)::float AS median_response_min,
                  round(avg(extract(epoch FROM i.resolved_at - i.created_at) / 3600) FILTER (WHERE i.resolved_at IS NOT NULL)::numeric, 2)::float AS avg_resolution_h,
                  count(*) FILTER (WHERE i.resolved_at IS NOT NULL)::int AS resolved
           ${FROM} WHERE ${where} AND COALESCE(i.verified_at, i.assigned_at) IS NOT NULL GROUP BY 1 ORDER BY 1`, params),
    queryOne(`SELECT round(avg(f.rating)::numeric, 2)::float AS avg_rating, count(f.id)::int AS responses,
                     count(*) FILTER (WHERE i.status = 'resolved')::int AS resolved
              ${FROM} LEFT JOIN feedback f ON f.incident_id = i.id WHERE ${where}`, params),
    query(`SELECT f.rating, count(*)::int AS count ${FROM} JOIN feedback f ON f.incident_id = i.id WHERE ${where} GROUP BY 1 ORDER BY 1`, params),
    queryOne(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'converted')::int AS converted
              FROM inquiries WHERE created_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Manila'
                AND created_at < (($2::date) + 1)::timestamp AT TIME ZONE 'Asia/Manila'`, [r.from, r.to]),
  ]);
  return { range: r, totals, byStatus, byCategory, byBarangay, bySource, daily, times, satisfaction, ratingDist, inquiries };
}

export async function exportRows(user: SessionUser, r: Range) {
  const { params, where } = base(user, r);
  return query<Record<string, string | number | null>>(
    `SELECT i.control_number, c.name_en AS category, i.module, i.source, i.status, i.priority, COALESCE(b.name, '') AS barangay,
            round(ST_Y(i.location)::numeric, 5)::float AS lat, round(ST_X(i.location)::numeric, 5)::float AS lng,
            i.people_affected, u.name AS assigned_unit,
            to_char(i.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI') AS reported_at,
            to_char(i.resolved_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI') AS resolved_at,
            round((extract(epoch FROM COALESCE(i.verified_at, i.assigned_at) - i.created_at) / 60)::numeric, 1)::float AS response_min,
            round((extract(epoch FROM i.resolved_at - i.created_at) / 3600)::numeric, 2)::float AS resolution_h,
            f.rating
     ${FROM} LEFT JOIN response_units u ON u.id = i.assigned_unit_id LEFT JOIN feedback f ON f.incident_id = i.id
     WHERE ${where} ORDER BY i.created_at`, params);
}
