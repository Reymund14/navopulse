import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

/** Barangay directory. ?geo=1 adds boundary polygons as GeoJSON. */
export const GET = route(async (req) => {
  const geo = new URL(req.url).searchParams.get("geo") === "1";
  const rows = await query(
    `SELECT id, name, district, hotline, address, officials, population, ST_Y(centroid) AS lat, ST_X(centroid) AS lng
            ${geo ? ", ST_AsGeoJSON(boundary, 6)::json AS boundary" : ""}
     FROM barangays ORDER BY name`);
  return json({ barangays: rows }, { headers: { "Cache-Control": "public, max-age=300" } });
});
