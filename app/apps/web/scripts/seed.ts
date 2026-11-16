/**
 * Seed demo data: barangays (with generated boundaries), categories, units,
 * staff and citizen accounts, content, and realistic sample incidents.
 *   pnpm db:seed                      ~600 incidents over the last 60 days
 *   SEED_INCIDENTS=5000 pnpm db:seed  for map performance testing
 * Re-running is safe: it truncates demo tables first.
 */
import bcrypt from "bcryptjs";
import { MODULE_CODES } from "@navopulse/shared";
import { pool } from "../src/lib/db";
import { encrypt, lookupHash } from "../src/lib/crypto";
import { nextControlNumber } from "../src/lib/controlNumbers";
import {
  ANNOUNCEMENTS, BARANGAYS, BUSINESSES, CATEGORIES, CITIZENS, CITY_OUTLINE_WKT, DEMO_PASSWORD,
  DESCRIPTIONS, STAFF, TRANSIT_ROUTES, UNITS,
} from "./seed-data";

// Deterministic PRNG so every seed run produces the same demo.
let state = 20261019;
function rand() {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
function gaussian() {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}

async function main() {
  const db = pool();
  const total = Number(process.env.SEED_INCIDENTS ?? 600);
  console.log("Truncating…");
  await db.query(`TRUNCATE audit_logs, notifications, sms_messages, feedback, incident_notes, incident_status_history,
    incident_media, incidents, inquiries, control_sequences, advisories, device_tokens, sessions, otp_codes, users,
    response_units, incident_categories, transit_stops, transit_routes, businesses, events, announcements, barangays, settings CASCADE`);

  // ---- barangays + generated boundaries
  for (const b of BARANGAYS) {
    await db.query(
      `INSERT INTO barangays (name, district, centroid, hotline, address, officials)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7)`,
      [b.name, b.district, b.lng, b.lat, "Placeholder: set official hotline", `Barangay Hall, ${b.name}, Navotas City`,
        JSON.stringify([{ position: "Punong Barangay", name: "To be updated by PIO" }, { position: "Barangay Secretary", name: "To be updated by PIO" }])],
    );
  }
  await db.query(`
    WITH outline AS (SELECT ST_GeomFromText($1, 4326) AS g),
    cells AS (
      SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(centroid), 0, (SELECT ST_Expand(g, 0.05) FROM outline)))).geom AS cell
      FROM barangays
    )
    UPDATE barangays b SET boundary = ST_Multi(ST_Intersection(c.cell, o.g))
    FROM cells c, outline o
    WHERE ST_Contains(c.cell, b.centroid)`, [CITY_OUTLINE_WKT]);

  const brgys = (await db.query<{ id: string; name: string; lat: number; lng: number }>(
    `SELECT id, name, ST_Y(centroid) AS lat, ST_X(centroid) AS lng FROM barangays`)).rows;
  const brgyByName = new Map(brgys.map((b) => [b.name, b]));

  // ---- categories, units
  for (const [i, c] of CATEGORIES.entries()) {
    await db.query(
      `INSERT INTO incident_categories (code, name_en, name_fil, module, default_office, priority, color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [c.code, c.nameEn, c.nameFil, c.module, c.office, c.priority, c.color, i]);
  }
  const cats = (await db.query<{ id: string; code: string; module: string; priority: string }>(
    `SELECT id, code, module, priority FROM incident_categories`)).rows;

  for (const u of UNITS) {
    const b = pick(brgys);
    await db.query(
      `INSERT INTO response_units (name, office, type, contact, current_location) VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326))`,
      [u.name, u.office, u.type, u.contact, b.lng, b.lat]);
  }
  const units = (await db.query<{ id: string; name: string; office: string }>(`SELECT id, name, office FROM response_units`)).rows;
  const unitByName = new Map(units.map((u) => [u.name, u]));

  // ---- users
  const pw = await bcrypt.hash(DEMO_PASSWORD, 10);
  const staffIds: Record<string, string> = {};
  for (const s of STAFF) {
    const unitId = "unit" in s ? unitByName.get(s.unit)?.id ?? null : null;
    const r = await db.query<{ id: string }>(
      `INSERT INTO users (role, full_name, email, password_hash, preferred_language, is_verified, unit_id, privacy_consent_at)
       VALUES ($1,$2,$3,$4,'en',true,$5, now()) RETURNING id`, [s.role, s.fullName, s.email, pw, unitId]);
    staffIds[s.role === "field_responder" ? s.email : s.role] = r.rows[0]!.id;
  }
  const citizenIds: string[] = [];
  for (const c of CITIZENS) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO users (role, full_name, mobile_number_enc, mobile_hash, barangay_id, preferred_language, is_verified, privacy_consent_at)
       VALUES ('citizen',$1,$2,$3,$4,$5,true, now()) RETURNING id`,
      [c.fullName, encrypt(c.mobile), lookupHash(c.mobile), brgyByName.get(c.barangay)!.id, c.lang]);
    citizenIds.push(r.rows[0]!.id);
  }

  // ---- incidents
  console.log(`Creating ${total} incidents…`);
  const now = Date.now();
  const dispatcher = staffIds.drrmo_dispatcher!;
  const tmo = staffIds.tmo_officer!;
  // Weighted category mix: civic/traffic are daily, emergencies spike on "storm days".
  // Day 0 is an ongoing high-tide + monsoon event so the live map has open SOS reports in the demo.
  const stormDays = new Set([0, 3, 4, 17, 18, 19, 41]);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < total; i++) {
      const daysAgo = rand() < 0.18 ? 0 : rand() < 0.1 ? 1 : Math.floor(rand() * 60);
      const storm = stormDays.has(daysAgo);
      let cat = pick(cats);
      const byCode = (code: string) => cats.find((c) => c.code === code)!;
      if (storm && rand() < 0.6) cat = byCode(pick(["EMR_FLOOD", "EMR_FLOOD", "EMR_STORM_SURGE", "CIV_DRAINAGE"]));
      else if (!storm && cat.module === "emergency" && rand() < 0.6) cat = byCode(pick(["TRF_ILLEGAL_PARKING", "CIV_WASTE", "TRF_OBSTRUCTION"]));

      const created = new Date(now - daysAgo * 86400_000 - Math.floor(rand() * 86400_000));
      const b = pick(brgys);
      const lat = b.lat + gaussian() * 0.0018;
      const lng = b.lng + gaussian() * 0.0018;
      const source = rand() < 0.65 ? "app" : rand() < 0.5 ? "navobot" : rand() < 0.7 ? "sms" : "walk_in";
      const isEmr = cat.module === "emergency";
      const age = (now - created.getTime()) / 3600_000;
      // Older cases are more likely closed.
      const r = rand();
      let status: string;
      if (age < 2) status = r < 0.6 ? "submitted" : r < 0.85 ? "verified" : "assigned";
      else if (age < 24) status = r < 0.15 ? "submitted" : r < 0.3 ? "verified" : r < 0.5 ? "assigned" : r < 0.65 ? "in_progress" : r < 0.95 ? "resolved" : "rejected";
      else status = r < 0.03 ? "submitted" : r < 0.06 ? "assigned" : r < 0.1 ? "in_progress" : r < 0.88 ? "resolved" : r < 0.95 ? "rejected" : "duplicate";

      const verifyMin = isEmr ? 2 + rand() * 10 : 20 + rand() * 240;
      const assignMin = verifyMin + (isEmr ? 3 + rand() * 15 : 30 + rand() * 300);
      const resolveMin = assignMin + (isEmr ? 30 + rand() * 180 : 120 + rand() * 2400);
      const at = (min: number) => new Date(created.getTime() + min * 60_000);
      const reached = (s: string) => ["verified", "assigned", "in_progress", "resolved"].includes(status) && ["verified", "assigned", "in_progress", "resolved"].indexOf(status) >= ["verified", "assigned", "in_progress", "resolved"].indexOf(s);

      const unitPool = units.filter((u) => u.office === (isEmr || cat.code === "CIV_DRAINAGE" ? "DRRMO" : "TMO"));
      const unit = reached("assigned") ? pick(unitPool) : null;
      const reporter = source === "app" && rand() < 0.5 ? pick(citizenIds) : null;
      const reporterMobile = reporter ? null : `+63917${String(Math.floor(rand() * 9_000_000) + 1_000_000)}`;
      const code = MODULE_CODES[cat.module as "emergency" | "civic" | "traffic"];
      const controlNumber = await nextControlNumber(code, created, client);
      const actor = isEmr ? dispatcher : tmo;

      const ins = await client.query<{ id: string }>(
        `INSERT INTO incidents (control_number, client_id, category_id, module, reporter_id, reporter_name_enc, reporter_mobile_enc,
           reporter_mobile_hash, source, description, location, location_source, barangay_id, people_affected, status, priority, assigned_unit_id,
           created_at, verified_at, assigned_at, resolved_at, resolution_note)
         VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $22, $7, $8, ST_SetSRID(ST_MakePoint($9,$10),4326), $11, $12, $13, $14, $15, $16,
           $17, $18, $19, $20, $21) RETURNING id`,
        [controlNumber, cat.id, cat.module, reporter,
          reporter ? null : encrypt(pick(["Ka Berto", "Aling Rosa", "Mang Pedro", "Liza M.", "Anonymous"])),
          reporterMobile ? encrypt(reporterMobile) : null,
          source, pick(DESCRIPTIONS[cat.code] ?? ["Concern reported"]), lng, lat,
          source === "sms" ? "sms" : source === "navobot" ? "navobot" : rand() < 0.3 ? "exif" : "device",
          b.id, isEmr ? 1 + Math.floor(rand() * 8) : null, status,
          storm && isEmr ? "critical" : cat.priority, unit?.id ?? null,
          created, reached("verified") ? at(verifyMin) : null, reached("assigned") ? at(assignMin) : null,
          status === "resolved" ? at(resolveMin) : null,
          status === "resolved" ? pick(["Resolved on site.", "Residents evacuated safely.", "Vehicle towed, owner cited.", "Area cleared and cleaned.", "Referred to City Engineering, repaired."]) : null,
          reporterMobile ? lookupHash(reporterMobile) : null],
      );
      const id = ins.rows[0]!.id;

      const hist: [string | null, string, Date][] = [[null, "submitted", created]];
      if (reached("verified")) hist.push(["submitted", "verified", at(verifyMin)]);
      if (reached("assigned")) hist.push(["verified", "assigned", at(assignMin)]);
      if (reached("in_progress")) hist.push(["assigned", "in_progress", at(assignMin + 5)]);
      if (status === "resolved") hist.push(["in_progress", "resolved", at(resolveMin)]);
      if (status === "rejected" || status === "duplicate") hist.push(["submitted", status, at(verifyMin)]);
      for (const [from, to, when] of hist) {
        await client.query(
          `INSERT INTO incident_status_history (incident_id, from_status, to_status, changed_by, created_at, note) VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, from, to, from === null ? reporter : actor, when, to === "assigned" ? `Assigned to ${unit?.name}` : null]);
      }
      if (status === "resolved" && rand() < 0.55) {
        const rating = Math.min(5, Math.max(1, Math.round(4.2 + gaussian() * 0.9)));
        await client.query(`INSERT INTO feedback (incident_id, citizen_id, rating, comment, created_at) VALUES ($1,$2,$3,$4,$5)`,
          [id, reporter, rating, rating >= 4 ? pick(["Mabilis ang aksyon, salamat!", "Very responsive team.", null]) : pick(["Medyo matagal dumating.", null]), at(resolveMin + 60)]);
      }
    }
    // A few NavoBot inquiries that were answered without becoming incidents.
    for (let i = 0; i < 40; i++) {
      const created = new Date(now - Math.floor(rand() * 60) * 86400_000);
      await client.query(`INSERT INTO inquiries (control_number, channel, topic, status, created_at, conversation_id) VALUES ($1,'navobot',$2,$3,$4,$5)`,
        [await nextControlNumber("INQ", created, client), pick(["Business permit requirements", "Senior citizen ID", "Evacuation center location", "Garbage collection schedule", "Cedula"]),
          pick(["answered", "answered", "closed", "open"]), created, `demo-${i}`]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // ---- content
  for (const [i, a] of ANNOUNCEMENTS.entries()) {
    await db.query(`INSERT INTO announcements (title_en, title_fil, body_en, body_fil, published_at, created_by) VALUES ($1,$2,$3,$4, now() - ($5 || ' days')::interval, $6)`,
      [a.titleEn, a.titleFil, a.bodyEn, a.bodyFil, String(i * 3), staffIds.pio_admin]);
  }
  for (const [i, e] of [["Sample: Navotas Fish Festival", "Navotas Fish Port Complex", "Bangculasi"], ["Sample: Earthquake and flood drill", "Navotas City Hall grounds", "Navotas West"], ["Sample: Free medical mission", "Tangos covered court", "Tangos South"]].entries()) {
    const b = brgyByName.get(e[2]!)!;
    await db.query(`INSERT INTO events (title, description, venue, barangay_id, location, starts_at, ends_at)
      VALUES ($1, 'Sample event for the demo.', $2, $3, ST_SetSRID(ST_MakePoint($4,$5),4326), now() + ($6 || ' days')::interval, now() + ($6 || ' days')::interval + interval '4 hours')`,
      [e[0], e[1], b.id, b.lng, b.lat, String(3 + i * 5)]);
  }
  for (const biz of BUSINESSES) {
    const b = brgyByName.get(biz.barangay)!;
    await db.query(`INSERT INTO businesses (name, category, description, address, contact, barangay_id, location) VALUES ($1,$2,$3,$4,'Sample contact',$5, ST_SetSRID(ST_MakePoint($6,$7),4326))`,
      [biz.name, biz.category, biz.description, `${biz.barangay}, Navotas City`, b.id, b.lng + 0.0005, b.lat + 0.0005]);
  }
  for (const r of TRANSIT_ROUTES) {
    const line = `LINESTRING(${r.path.map(([x, y]) => `${x} ${y}`).join(", ")})`;
    const ins = await db.query<{ id: string }>(`INSERT INTO transit_routes (code, name, mode, origin, destination, fare_min, fare_notes, description, path)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ST_GeomFromText($9, 4326)) RETURNING id`,
      [r.code, r.name, r.mode, r.origin, r.destination, r.fareMin, r.fareNotes, r.description, line]);
    for (const [name, kind, x, y] of r.stops) {
      await db.query(`INSERT INTO transit_stops (route_id, name, kind, location) VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326))`, [ins.rows[0]!.id, name, kind, x, y]);
    }
  }
  await db.query(`INSERT INTO advisories (title, body_en, body_fil, severity, channels, sent_by, sent_at, expires_at)
    VALUES ('High tide advisory (sample)', 'Sample advisory: high tide of 1.6 m expected at 2:00 PM. Avoid low-lying coastal streets.',
      'Halimbawang abiso: inaasahang high tide na 1.6 m mamayang 2:00 PM. Iwasan ang mabababang kalye malapit sa dagat.',
      'advisory', '{push}', $1, now() - interval '3 hours', now() + interval '1 day')`, [staffIds.drrmo_dispatcher]);

  const counts = await db.query(`SELECT (SELECT count(*) FROM incidents) AS incidents, (SELECT count(*) FROM barangays WHERE boundary IS NOT NULL) AS boundaries`);
  console.log("Seeded:", counts.rows[0]);
  console.log(`Staff logins (password ${DEMO_PASSWORD}):`, STAFF.map((s) => s.email).join(", "));
  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
