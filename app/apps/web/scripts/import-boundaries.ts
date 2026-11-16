/**
 * Replace the generated demo barangay boundaries with official polygons.
 *   pnpm --filter @navopulse/web tsx scripts/import-boundaries.ts navotas-barangays.geojson [nameProperty]
 *
 * Input: a GeoJSON FeatureCollection in WGS84 (EPSG:4326) with one Polygon or
 * MultiPolygon per barangay (e.g. exported from PSA/NAMRIA shapefiles with
 * `ogr2ogr -f GeoJSON -t_srs EPSG:4326 out.geojson in.shp`). Features are
 * matched to barangays by name (case- and space-insensitive); centroids are
 * recomputed. Unmatched names are reported, nothing is created.
 */
import { readFileSync } from "node:fs";
import { pool } from "../src/lib/db";

async function main() {
  const [file, nameProp = "name"] = process.argv.slice(2);
  if (!file) throw new Error("Usage: import-boundaries.ts <file.geojson> [nameProperty]");
  const fc = JSON.parse(readFileSync(file, "utf8")) as { features: { properties: Record<string, unknown>; geometry: unknown }[] };
  const db = pool();
  let updated = 0;
  for (const f of fc.features) {
    const name = String(f.properties[nameProp] ?? "").trim();
    const res = await db.query(
      `UPDATE barangays SET boundary = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
         centroid = ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)), updated_at = now()
       WHERE lower(replace(name, ' ', '')) = lower(replace($1, ' ', ''))`,
      [name, JSON.stringify(f.geometry)]);
    if (res.rowCount) updated++;
    else console.warn(`No barangay named "${name}"`);
  }
  console.log(`Updated ${updated} of ${fc.features.length} features`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
