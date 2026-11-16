import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

export const GET = route(async () => {
  const routes = await query(
    `SELECT r.id, r.code, r.name, r.mode, r.origin, r.destination, r.fare_min::float AS fare_min, r.fare_notes, r.description,
            ST_AsGeoJSON(r.path, 6)::json AS path,
            COALESCE(json_agg(json_build_object('name', s.name, 'kind', s.kind, 'lat', ST_Y(s.location), 'lng', ST_X(s.location)))
                     FILTER (WHERE s.id IS NOT NULL), '[]') AS stops
     FROM transit_routes r LEFT JOIN transit_stops s ON s.route_id = r.id
     WHERE r.is_active GROUP BY r.id ORDER BY r.mode, r.name`);
  return json({ routes }, { headers: { "Cache-Control": "public, max-age=300" } });
});
