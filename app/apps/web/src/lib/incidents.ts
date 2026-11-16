import {
  canTransition, MODULE_CODES, type IncidentModule, type IncidentSource, type IncidentStatus, type Priority,
} from "@navopulse/shared";
import type { PoolClient } from "pg";
import { audit } from "./audit";
import type { SessionUser } from "./auth";
import { nextControlNumber } from "./controlNumbers";
import { decrypt, encrypt, lookupHash, maskMobile, maskName } from "./crypto";
import { query, queryOne, tx } from "./db";
import { ApiError } from "./http";
import { notifyIncidentStatus } from "./notifications";
import { can, officeScope, seesReporterIdentity } from "./rbac";

export interface NewIncident {
  clientId?: string | null;
  categoryCode: string;
  description: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  locationSource: "device" | "exif" | "manual" | "sms" | "navobot" | "barangay_centroid";
  addressText?: string | null;
  barangayId?: string | null;
  peopleAffected?: number | null;
  observedAt?: string | null;
  source: IncidentSource;
  reporterId?: string | null;
  reporterName?: string | null;
  reporterMobile?: string | null;
  inquiryId?: string | null;
  mediaIds?: string[];
}

export interface CreatedIncident {
  id: string;
  controlNumber: string;
  status: IncidentStatus;
  module: IncidentModule;
  created: boolean;
}

/**
 * Create an incident. Idempotent on clientId: a retry from the offline queue,
 * or the same report arriving by SMS after the app eventually synced, returns
 * the existing record instead of a duplicate.
 */
export async function createIncident(input: NewIncident): Promise<CreatedIncident> {
  if (input.clientId) {
    const existing = await queryOne<{ id: string; control_number: string; status: IncidentStatus; module: IncidentModule }>(
      `SELECT id, control_number, status, module FROM incidents WHERE client_id = $1`, [input.clientId]);
    if (existing) return { id: existing.id, controlNumber: existing.control_number, status: existing.status, module: existing.module, created: false };
  }
  const cat = await queryOne<{ id: string; module: IncidentModule; priority: Priority }>(
    `SELECT id, module, priority FROM incident_categories WHERE code = $1 AND is_active`, [input.categoryCode]);
  if (!cat) throw new ApiError(400, `Unknown category ${input.categoryCode}`);

  return tx(async (client) => {
    const controlNumber = await nextControlNumber(MODULE_CODES[cat.module], new Date(), client);
    const res = await client.query<{ id: string }>(
      `INSERT INTO incidents (control_number, client_id, category_id, module, reporter_id, reporter_name_enc, reporter_mobile_enc,
         reporter_mobile_hash, source, description, location, location_accuracy_m, location_source, address_text, barangay_id,
         people_affected, priority, observed_at, inquiry_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, ST_SetSRID(ST_MakePoint($11,$12),4326), $13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (client_id) DO NOTHING
       RETURNING id`,
      [controlNumber, input.clientId ?? null, cat.id, cat.module, input.reporterId ?? null,
        input.reporterName ? encrypt(input.reporterName) : null,
        input.reporterMobile ? encrypt(input.reporterMobile) : null,
        input.reporterMobile ? lookupHash(input.reporterMobile) : null,
        input.source, input.description, input.lng, input.lat, input.accuracy ?? null, input.locationSource,
        input.addressText ?? null, input.barangayId ?? null, input.peopleAffected ?? null, cat.priority,
        input.observedAt ?? null, input.inquiryId ?? null],
    );
    if (!res.rows[0]) {
      // Lost a race with a concurrent retry carrying the same clientId.
      const existing = await client.query<{ id: string; control_number: string; status: IncidentStatus }>(
        `SELECT id, control_number, status FROM incidents WHERE client_id = $1`, [input.clientId]);
      const e = existing.rows[0]!;
      return { id: e.id, controlNumber: e.control_number, status: e.status, module: cat.module, created: false };
    }
    const id = res.rows[0].id;
    await client.query(
      `INSERT INTO incident_status_history (incident_id, from_status, to_status, changed_by, note) VALUES ($1, NULL, 'submitted', $2, $3)`,
      [id, input.reporterId ?? null, `Received via ${input.source}`]);
    if (input.mediaIds?.length) {
      await client.query(
        `UPDATE incident_media SET incident_id = $1
         WHERE id = ANY($2::uuid[]) AND incident_id IS NULL AND type = 'report' AND (uploaded_by IS NOT DISTINCT FROM $3)`,
        [id, input.mediaIds, input.reporterId ?? null]);
    }
    return { id, controlNumber, status: "submitted" as IncidentStatus, module: cat.module, created: true };
  });
}

// ------------------------------------------------------------------ access scope

/** SQL predicate restricting which incidents a staff user may see. Alias: i = incidents, c = categories. */
export function scopeSql(user: SessionUser, params: unknown[]): string {
  if (user.role === "super_admin") return "TRUE";
  if (user.role === "field_responder") {
    params.push(user.unitId);
    return `i.assigned_unit_id = $${params.length}`;
  }
  const office = officeScope(user.role);
  if (!office) return "FALSE";
  params.push(office);
  const p = `$${params.length}`;
  // PIO also owns tickets that came in through NavoBot.
  return office === "PIO" ? `(c.default_office = ${p} OR i.source = 'navobot')` : `c.default_office = ${p}`;
}

async function loadScoped(user: SessionUser, id: string) {
  const params: unknown[] = [id];
  const scope = scopeSql(user, params);
  const row = await queryOne<{ id: string; status: IncidentStatus; module: IncidentModule; assigned_unit_id: string | null; control_number: string; duplicate_of_id: string | null }>(
    `SELECT i.id, i.status, i.module, i.assigned_unit_id, i.control_number, i.duplicate_of_id
     FROM incidents i JOIN incident_categories c ON c.id = i.category_id WHERE i.id = $1 AND ${scope}`, params);
  if (!row) throw new ApiError(404, "Incident not found");
  return row;
}

// ------------------------------------------------------------------ queries

export interface IncidentFilters {
  module?: IncidentModule;
  status?: IncidentStatus[];
  source?: IncidentSource[];
  priority?: Priority[];
  barangayId?: string;
  categoryCode?: string;
  from?: string;
  to?: string;
  q?: string;
  limit: number;
}

export async function listIncidents(user: SessionUser, f: IncidentFilters) {
  const params: unknown[] = [];
  const where = [scopeSql(user, params)];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (f.module) add("i.module = ?", f.module);
  if (f.status?.length) add("i.status = ANY(?)", f.status);
  if (f.source?.length) add("i.source = ANY(?)", f.source);
  if (f.priority?.length) add("i.priority = ANY(?)", f.priority);
  if (f.barangayId) add("i.barangay_id = ?", f.barangayId);
  if (f.categoryCode) add("c.code = ?", f.categoryCode);
  // Date filters are Manila calendar days.
  if (f.from) add("i.created_at >= (?::date)::timestamp AT TIME ZONE 'Asia/Manila'", f.from);
  if (f.to) add("i.created_at < ((?::date) + 1)::timestamp AT TIME ZONE 'Asia/Manila'", f.to);
  if (f.q) add("(i.control_number ILIKE ? OR i.description ILIKE ?)", `%${f.q}%`);
  params.push(f.limit);
  return query<{
    id: string; control_number: string; status: IncidentStatus; priority: Priority; module: IncidentModule; source: IncidentSource;
    category_code: string; category_name: string; color: string; description: string; lat: number; lng: number;
    barangay: string | null; unit: string | null; people_affected: number | null; created_at: string;
  }>(
    `SELECT i.id, i.control_number, i.status, i.priority, i.module, i.source, c.code AS category_code, c.name_en AS category_name,
            c.color, left(i.description, 160) AS description, ST_Y(i.location) AS lat, ST_X(i.location) AS lng,
            b.name AS barangay, u.name AS unit, i.people_affected, i.created_at
     FROM incidents i
     JOIN incident_categories c ON c.id = i.category_id
     LEFT JOIN barangays b ON b.id = i.barangay_id
     LEFT JOIN response_units u ON u.id = i.assigned_unit_id
     WHERE ${where.join(" AND ")}
     ORDER BY (i.status IN ('resolved','rejected','duplicate')), CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, i.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
}

export async function getIncidentDetail(user: SessionUser, id: string, req: Request) {
  await loadScoped(user, id);
  const inc = await queryOne<Record<string, unknown> & {
    reporter_name_enc: string | null; reporter_mobile_enc: string | null; user_full_name: string | null; user_mobile_enc: string | null;
  }>(
    `SELECT i.id, i.control_number, i.status, i.priority, i.module, i.source, i.description, i.address_text, i.people_affected,
            i.location_source, i.location_accuracy_m, i.observed_at, i.created_at, i.updated_at, i.verified_at, i.assigned_at, i.resolved_at,
            i.resolution_note, i.duplicate_of_id, i.assigned_unit_id, i.reporter_id, i.inquiry_id,
            ST_Y(i.location) AS lat, ST_X(i.location) AS lng,
            c.code AS category_code, c.name_en AS category_name, c.color, c.default_office,
            b.id AS barangay_id, b.name AS barangay,
            un.name AS unit_name, un.contact AS unit_contact,
            d.control_number AS duplicate_of_control_number,
            i.reporter_name_enc, i.reporter_mobile_enc, ru.full_name AS user_full_name, ru.mobile_number_enc AS user_mobile_enc,
            f.rating AS feedback_rating, f.comment AS feedback_comment
     FROM incidents i
     JOIN incident_categories c ON c.id = i.category_id
     LEFT JOIN barangays b ON b.id = i.barangay_id
     LEFT JOIN response_units un ON un.id = i.assigned_unit_id
     LEFT JOIN incidents d ON d.id = i.duplicate_of_id
     LEFT JOIN users ru ON ru.id = i.reporter_id
     LEFT JOIN feedback f ON f.incident_id = i.id
     WHERE i.id = $1`, [id]);
  if (!inc) throw new ApiError(404, "Incident not found");

  const name = inc.user_full_name ?? decrypt(inc.reporter_name_enc);
  const mobile = decrypt(inc.user_mobile_enc) ?? decrypt(inc.reporter_mobile_enc);
  const full = seesReporterIdentity(user.role);
  if (full && (name || mobile)) await audit(req, user.id, "pii.view", "incident", id);
  const { reporter_name_enc: _a, reporter_mobile_enc: _b, user_full_name: _c, user_mobile_enc: _d, ...rest } = inc;
  void _a; void _b; void _c; void _d;

  const [history, notes, media, nearby] = await Promise.all([
    query(`SELECT h.from_status, h.to_status, h.note, h.created_at, u.full_name AS changed_by
           FROM incident_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.incident_id = $1 ORDER BY h.created_at`, [id]),
    query(`SELECT n.id, n.body, n.created_at, u.full_name AS author FROM incident_notes n JOIN users u ON u.id = n.author_id WHERE n.incident_id = $1 ORDER BY n.created_at`, [id]),
    query(`SELECT id, type, mime_type, exif_lat, exif_lng, exif_taken_at, created_at FROM incident_media WHERE incident_id = $1 ORDER BY created_at`, [id]),
    // Possible duplicates: same category, open, within 150 m and 24 h.
    query(`SELECT o.id, o.control_number, o.status, o.created_at, round(ST_Distance(o.location::geography, i.location::geography)) AS distance_m
           FROM incidents i JOIN incidents o ON o.id <> i.id AND o.category_id = i.category_id
           WHERE i.id = $1 AND o.status NOT IN ('rejected','duplicate')
             AND ST_DWithin(o.location::geography, i.location::geography, 150)
             AND abs(extract(epoch FROM o.created_at - i.created_at)) < 86400
           ORDER BY distance_m LIMIT 5`, [id]),
  ]);

  return {
    ...rest,
    reporter: {
      name: full ? name : maskName(name),
      mobile: full ? mobile : maskMobile(mobile),
      masked: !full,
      canReveal: !full && can(user.role, "pii.reveal"),
      registered: !!inc.reporter_id,
    },
    history, notes, media, possibleDuplicates: nearby,
  };
}

/** Explicit, logged reveal of reporter contact for roles that see it masked by default. */
export async function revealReporter(user: SessionUser, id: string, req: Request) {
  await loadScoped(user, id);
  const row = await queryOne<{ reporter_name_enc: string | null; reporter_mobile_enc: string | null; full_name: string | null; mobile_number_enc: string | null }>(
    `SELECT i.reporter_name_enc, i.reporter_mobile_enc, u.full_name, u.mobile_number_enc FROM incidents i LEFT JOIN users u ON u.id = i.reporter_id WHERE i.id = $1`, [id]);
  await audit(req, user.id, "pii.reveal", "incident", id);
  return { name: row?.full_name ?? decrypt(row?.reporter_name_enc), mobile: decrypt(row?.mobile_number_enc) ?? decrypt(row?.reporter_mobile_enc) };
}

// ------------------------------------------------------------------ mutations

const STATUS_TIMESTAMP: Partial<Record<IncidentStatus, string>> = {
  verified: "verified_at", assigned: "assigned_at", resolved: "resolved_at",
};

async function applyStatus(client: PoolClient, id: string, from: IncidentStatus, to: IncidentStatus, actorId: string, note?: string | null, extraSet = "", extraParams: unknown[] = []) {
  const ts = STATUS_TIMESTAMP[to];
  const params: unknown[] = [id, to, ...extraParams];
  await client.query(
    `UPDATE incidents SET status = $2${ts ? `, ${ts} = COALESCE(${ts}, now())` : ""}${extraSet} WHERE id = $1`, params);
  await client.query(
    `INSERT INTO incident_status_history (incident_id, from_status, to_status, changed_by, note) VALUES ($1,$2,$3,$4,$5)`,
    [id, from, to, actorId, note ?? null]);
}

export async function changeStatus(user: SessionUser, id: string, to: IncidentStatus, note: string | undefined, req: Request) {
  const inc = await loadScoped(user, id);
  if (user.role === "field_responder" && !["in_progress", "resolved"].includes(to)) {
    throw new ApiError(403, "Responders can only start or resolve assigned incidents");
  }
  if (to === "duplicate") throw new ApiError(400, "Use the merge action to mark a duplicate");
  if (to === "assigned") throw new ApiError(400, "Use the assign action to assign a unit");
  if (to === "resolved") throw new ApiError(400, "Use the resolve action so a resolution note is recorded");
  if (!canTransition(inc.status, to)) throw new ApiError(409, `Cannot move from ${inc.status} to ${to}`);
  await tx((c) => applyStatus(c, id, inc.status, to, user.id, note));
  await audit(req, user.id, "incident.status_change", "incident", id, { status: inc.status }, { status: to, note });
  await notifyIncidentStatus(id, to, note).catch((e) => console.error("[notify]", e));
  return { status: to };
}

export async function assignUnit(user: SessionUser, id: string, unitId: string, note: string | undefined, req: Request) {
  const inc = await loadScoped(user, id);
  if (!["submitted", "verified", "assigned", "in_progress"].includes(inc.status)) throw new ApiError(409, `Cannot assign a ${inc.status} incident`);
  const unit = await queryOne<{ id: string; name: string; office: string; incident_office: string }>(
    `SELECT u.id, u.name, u.office, c.default_office AS incident_office
     FROM response_units u, incidents i JOIN incident_categories c ON c.id = i.category_id WHERE u.id = $1 AND i.id = $2`, [unitId, id]);
  if (!unit) throw new ApiError(400, "Unknown response unit");
  // Units belong to DRRMO or TMO; PIO concerns may go to either office's crews.
  if (user.role !== "super_admin" && unit.incident_office !== "PIO" && unit.office !== unit.incident_office) {
    throw new ApiError(400, `${unit.name} is a ${unit.office} unit; this incident belongs to ${unit.incident_office}`);
  }
  const to: IncidentStatus = inc.status === "in_progress" ? "in_progress" : "assigned";
  await tx(async (c) => {
    await applyStatus(c, id, inc.status, to, user.id, `Assigned to ${unit.name}${note ? `: ${note}` : ""}`, ", assigned_unit_id = $3", [unitId]);
    await c.query(`UPDATE response_units SET is_available = false WHERE id = $1`, [unitId]);
  });
  await audit(req, user.id, "incident.assign", "incident", id, { unitId: inc.assigned_unit_id, status: inc.status }, { unitId, status: to });
  await notifyIncidentStatus(id, to, `${unit.name}`).catch((e) => console.error("[notify]", e));
  return { status: to, unit };
}

export async function mergeDuplicate(user: SessionUser, id: string, duplicateOfId: string, note: string | undefined, req: Request) {
  if (id === duplicateOfId) throw new ApiError(400, "An incident cannot duplicate itself");
  const inc = await loadScoped(user, id);
  const target = await loadScoped(user, duplicateOfId);
  if (target.status === "duplicate") throw new ApiError(400, `${target.control_number} is itself a duplicate; merge into ${target.duplicate_of_id ? "its original" : "another case"}`);
  if (!canTransition(inc.status, "duplicate")) throw new ApiError(409, `Cannot merge a ${inc.status} incident`);
  await tx(async (c) => {
    await applyStatus(c, id, inc.status, "duplicate", user.id, `Merged into ${target.control_number}${note ? `: ${note}` : ""}`, ", duplicate_of_id = $3", [duplicateOfId]);
    await c.query(`INSERT INTO incident_notes (incident_id, author_id, body) VALUES ($1,$2,$3)`, [duplicateOfId, user.id, `Duplicate report ${inc.control_number} merged into this case.`]);
  });
  await audit(req, user.id, "incident.merge", "incident", id, { status: inc.status }, { status: "duplicate", duplicateOfId });
  await notifyIncidentStatus(id, "duplicate", `Tracked under ${target.control_number}.`).catch((e) => console.error("[notify]", e));
  return { status: "duplicate" as const };
}

export async function addNote(user: SessionUser, id: string, body: string, req: Request) {
  await loadScoped(user, id);
  const row = await queryOne(`INSERT INTO incident_notes (incident_id, author_id, body) VALUES ($1,$2,$3) RETURNING id, created_at`, [id, user.id, body]);
  await audit(req, user.id, "incident.note", "incident", id, null, { body });
  return row;
}

export async function resolveIncident(user: SessionUser, id: string, note: string, mediaIds: string[], req: Request) {
  const inc = await loadScoped(user, id);
  if (!canTransition(inc.status, "resolved")) throw new ApiError(409, `Cannot resolve a ${inc.status} incident`);
  await tx(async (c) => {
    await applyStatus(c, id, inc.status, "resolved", user.id, note, ", resolution_note = $3", [note]);
    if (mediaIds.length) {
      await c.query(`UPDATE incident_media SET incident_id = $1 WHERE id = ANY($2::uuid[]) AND incident_id IS NULL AND type = 'resolution' AND uploaded_by = $3`, [id, mediaIds, user.id]);
    }
    if (inc.assigned_unit_id) {
      await c.query(
        `UPDATE response_units SET is_available = true WHERE id = $1
           AND NOT EXISTS (SELECT 1 FROM incidents WHERE assigned_unit_id = $1 AND id <> $2 AND status IN ('assigned','in_progress'))`,
        [inc.assigned_unit_id, id]);
    }
  });
  await audit(req, user.id, "incident.resolve", "incident", id, { status: inc.status }, { status: "resolved", note, mediaIds });
  await notifyIncidentStatus(id, "resolved").catch((e) => console.error("[notify]", e));
  return { status: "resolved" as const };
}

// ------------------------------------------------------------------ citizen side

export async function listOwnIncidents(userId: string) {
  return query(
    `SELECT i.id, i.control_number, i.status, i.module, i.created_at, i.resolved_at, c.code AS category_code, c.name_en, c.name_fil,
            left(i.description, 160) AS description, b.name AS barangay, f.rating
     FROM incidents i JOIN incident_categories c ON c.id = i.category_id
     LEFT JOIN barangays b ON b.id = i.barangay_id LEFT JOIN feedback f ON f.incident_id = i.id
     WHERE i.reporter_id = $1 ORDER BY i.created_at DESC LIMIT 200`, [userId]);
}

export async function getOwnIncident(userId: string, id: string) {
  const inc = await queryOne<Record<string, unknown> & { status: IncidentStatus; control_number: string }>(
    `SELECT i.id, i.control_number, i.status, i.module, i.description, i.created_at, i.resolved_at, i.resolution_note, i.people_affected,
            ST_Y(i.location) AS lat, ST_X(i.location) AS lng, c.code AS category_code, c.name_en, c.name_fil, b.name AS barangay,
            d.control_number AS duplicate_of_control_number, f.rating, f.comment
     FROM incidents i JOIN incident_categories c ON c.id = i.category_id
     LEFT JOIN barangays b ON b.id = i.barangay_id LEFT JOIN incidents d ON d.id = i.duplicate_of_id LEFT JOIN feedback f ON f.incident_id = i.id
     WHERE i.id = $1 AND i.reporter_id = $2`, [id, userId]);
  if (!inc) throw new ApiError(404, "Report not found");
  const [history, media] = await Promise.all([
    // Internal notes are never shown to citizens; only status history.
    query(`SELECT to_status, created_at FROM incident_status_history WHERE incident_id = $1 ORDER BY created_at`, [id]),
    query(`SELECT id, type FROM incident_media WHERE incident_id = $1 ORDER BY created_at`, [id]),
  ]);
  return { ...inc, history, media };
}

export async function submitFeedback(userId: string, incidentId: string, rating: number, comment: string | undefined) {
  const inc = await queryOne<{ status: IncidentStatus }>(`SELECT status FROM incidents WHERE id = $1 AND reporter_id = $2`, [incidentId, userId]);
  if (!inc) throw new ApiError(404, "Report not found");
  if (inc.status !== "resolved") throw new ApiError(409, "You can rate a report once it is resolved");
  const row = await queryOne(
    `INSERT INTO feedback (incident_id, citizen_id, rating, comment) VALUES ($1,$2,$3,$4)
     ON CONFLICT (incident_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()
     RETURNING rating, comment`, [incidentId, userId, rating, comment ?? null]);
  return row;
}
