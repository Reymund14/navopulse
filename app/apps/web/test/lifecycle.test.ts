import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeSosSms, parseSosSms, SOS_CATEGORY_CODE } from "@navopulse/shared";
import { pool, query, queryOne } from "@/lib/db";
import {
  assignUnit, changeStatus, createIncident, getIncidentDetail, getOwnIncident, listIncidents, mergeDuplicate, resolveIncident, submitFeedback,
} from "@/lib/incidents";
import { mapNavobotCategory, navobotClientId, signNavobotBody, verifyNavobotRequest } from "@/lib/navobot";
import { setPushProvider, type PushProvider } from "@/lib/providers/push";
import { setSmsProvider, type SmsProvider } from "@/lib/providers/sms";
import { deliverAdvisory } from "@/lib/notifications";
import { citizen, fakeReq, staff } from "./helpers";

// Capture outbound messages instead of printing them.
const sms: { to: string; body: string }[] = [];
const pushes: { tokens: string[]; title: string }[] = [];
let smsSeq = 0;
const smsStub: SmsProvider = { name: "test", send: async (to, body) => { sms.push({ to, body }); return { providerMessageId: `t-${++smsSeq}`, status: "sent" }; } };
const pushStub: PushProvider = { name: "test", send: async (tokens, m) => { pushes.push({ tokens, title: m.title }); return tokens.map((token) => ({ token, ok: true })); } };

beforeAll(() => {
  setSmsProvider(smsStub);
  setPushProvider(pushStub);
});
afterAll(async () => {
  await pool().end();
});

describe("incident lifecycle (app source)", () => {
  it("runs submit → verify → assign → in progress → resolve → push → rating", async () => {
    const c = await citizen(1);
    await query(`INSERT INTO device_tokens (user_id, platform, token) VALUES ($1, 'android', 'test-token-123456') ON CONFLICT DO NOTHING`, [c.id]);
    const clientId = crypto.randomUUID();
    const created = await createIncident({
      clientId, categoryCode: "EMR_FLOOD", description: "Stranded sa bubong", lat: 14.6688, lng: 120.9398,
      locationSource: "device", source: "app", reporterId: c.id, peopleAffected: 3,
    });
    expect(created.created).toBe(true);
    expect(created.controlNumber).toMatch(/^NVP-EMR-\d{8}-\d{6}$/);

    // Idempotent retry (offline queue) returns the same incident.
    const retry = await createIncident({ clientId, categoryCode: "EMR_FLOOD", description: "x", lat: 1, lng: 1, locationSource: "device", source: "app", reporterId: c.id });
    expect(retry).toMatchObject({ id: created.id, created: false });

    // Barangay filled from PostGIS point-in-polygon.
    const b = await queryOne<{ name: string }>(`SELECT b.name FROM incidents i JOIN barangays b ON b.id = i.barangay_id WHERE i.id = $1`, [created.id]);
    expect(b?.name).toBeTruthy();

    const dispatcher = await staff("dispatch@navopulse.local");
    const req = fakeReq();
    await changeStatus(dispatcher, created.id, "verified", undefined, req);
    const unit = await queryOne<{ id: string }>(`SELECT id FROM response_units WHERE name = 'DRRMO Rescue Team Alpha'`);
    await assignUnit(dispatcher, created.id, unit!.id, "Bring the boat", req);

    const responder = await staff("responder@navopulse.local");
    await changeStatus(responder, created.id, "in_progress", undefined, req);
    await resolveIncident(responder, created.id, "Residents evacuated", [], req);

    const mine = await getOwnIncident(c.id, created.id);
    expect(mine.status).toBe("resolved");
    expect((mine.history as { to_status: string }[]).map((h) => h.to_status)).toEqual(["submitted", "verified", "assigned", "in_progress", "resolved"]);
    expect(pushes.some((p) => p.title.includes(created.controlNumber))).toBe(true);
    const feedbackReq = await queryOne(`SELECT 1 FROM notifications WHERE incident_id = $1 AND kind = 'feedback_request' AND channel = 'push'`, [created.id]);
    expect(feedbackReq).toBeTruthy();

    await submitFeedback(c.id, created.id, 5, "Salamat!");
    const fb = await queryOne<{ rating: number }>(`SELECT rating FROM feedback WHERE incident_id = $1`, [created.id]);
    expect(fb?.rating).toBe(5);

    const audit = await query(`SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY id`, [created.id]);
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["incident.status_change", "incident.assign", "incident.resolve"]));
  });

  it("rejects illegal transitions and out-of-role actions", async () => {
    const dispatcher = await staff("dispatch@navopulse.local");
    const responder = await staff("responder@navopulse.local");
    const inc = await createIncident({ categoryCode: "EMR_FIRE", description: "", lat: 14.66, lng: 120.945, locationSource: "manual", source: "walk_in" });
    await expect(changeStatus(dispatcher, inc.id, "in_progress", undefined, fakeReq())).rejects.toMatchObject({ status: 409 });
    // Responder cannot see an incident not assigned to their unit.
    await expect(changeStatus(responder, inc.id, "in_progress", undefined, fakeReq())).rejects.toMatchObject({ status: 404 });
  });
});

describe("RBAC scoping and privacy", () => {
  it("TMO cannot see DRRMO incidents; PIO sees reporter masked", async () => {
    const tmo = await staff("tmo@navopulse.local");
    const pio = await staff("pio@navopulse.local");
    const rows = await listIncidents(tmo, { limit: 1000 });
    const offices = await query<{ default_office: string }>(
      `SELECT DISTINCT c.default_office FROM incidents i JOIN incident_categories c ON c.id = i.category_id WHERE i.id = ANY($1)`, [rows.map((r) => r.id)]);
    expect(offices.map((o) => o.default_office)).toEqual(["TMO"]);

    const nb = await createIncident({ categoryCode: "CIV_OTHER", description: "Noise", lat: 14.656, lng: 120.943, locationSource: "navobot", source: "navobot", reporterName: "Juana Reyes", reporterMobile: "+639171112222" });
    const detail = await getIncidentDetail(pio, nb.id, fakeReq());
    expect(detail.reporter.masked).toBe(true);
    expect(detail.reporter.mobile).toBe("+63 917 *** 2222");
    expect(detail.reporter.name).toBe("J**** R****");
    const enc = await queryOne<{ reporter_mobile_enc: string }>(`SELECT reporter_mobile_enc FROM incidents WHERE id = $1`, [nb.id]);
    expect(enc!.reporter_mobile_enc.startsWith("v1.")).toBe(true);
    expect(enc!.reporter_mobile_enc).not.toContain("2222");
  });
});

describe("duplicates", () => {
  it("merges a duplicate into the original case", async () => {
    const dispatcher = await staff("dispatch@navopulse.local");
    const a = await createIncident({ categoryCode: "EMR_FLOOD", description: "a", lat: 14.6612, lng: 120.9462, locationSource: "device", source: "app" });
    const b = await createIncident({ categoryCode: "EMR_FLOOD", description: "b", lat: 14.6613, lng: 120.9463, locationSource: "device", source: "app" });
    const detail = await getIncidentDetail(dispatcher, b.id, fakeReq());
    expect(detail.possibleDuplicates.map((d) => (d as { id: string }).id)).toContain(a.id);
    await mergeDuplicate(dispatcher, b.id, a.id, undefined, fakeReq());
    const row = await queryOne<{ status: string; duplicate_of_id: string }>(`SELECT status, duplicate_of_id FROM incidents WHERE id = $1`, [b.id]);
    expect(row).toEqual({ status: "duplicate", duplicate_of_id: a.id });
  });
});

describe("offline SMS SOS", () => {
  it("parses the payload, creates an sms incident, and dedupes with the app retry", async () => {
    const clientRef = crypto.randomUUID();
    const body = encodeSosSms({ type: "medical", lat: 14.6748, lng: 120.9372, peopleAffected: 2, clientRef, note: "Nahimatay si lola" });
    const parsed = parseSosSms(body);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const viaSms = await createIncident({
      clientId: parsed.payload.clientRef, categoryCode: SOS_CATEGORY_CODE[parsed.payload.type], description: parsed.payload.note ?? "",
      lat: parsed.payload.lat, lng: parsed.payload.lng, locationSource: "sms", source: "sms", reporterMobile: "+639179998888", peopleAffected: 2,
    });
    expect(viaSms.created).toBe(true);
    // The phone regains data and the queued app report syncs: no duplicate.
    const viaApp = await createIncident({ clientId: clientRef, categoryCode: "EMR_MEDICAL", description: "", lat: 14.6748, lng: 120.9372, locationSource: "device", source: "app" });
    expect(viaApp).toMatchObject({ id: viaSms.id, created: false });

    // Reporter without an account is updated by SMS.
    const dispatcher = await staff("dispatch@navopulse.local");
    sms.length = 0;
    await changeStatus(dispatcher, viaSms.id, "verified", undefined, fakeReq());
    expect(sms.some((m) => m.to === "+639179998888" && m.body.includes(viaSms.controlNumber))).toBe(true);
  });
});

describe("NavoBot webhook", () => {
  it("verifies HMAC signatures with a replay window", () => {
    const raw = JSON.stringify({ hello: "world" });
    const headers = new Headers(signNavobotBody(raw, "dev-navobot-secret"));
    expect(verifyNavobotRequest(headers, raw)).toBe(true);
    expect(verifyNavobotRequest(headers, raw + " ")).toBe(false);
    const old = new Headers(signNavobotBody(raw, "dev-navobot-secret", Math.floor(Date.now() / 1000) - 600));
    expect(verifyNavobotRequest(old, raw)).toBe(false);
    expect(verifyNavobotRequest(new Headers(signNavobotBody(raw, "wrong")), raw)).toBe(false);
  });
  it("maps Taglish categories and builds stable ids", () => {
    const codes = new Set(["CIV_WASTE", "EMR_FLOOD"]);
    expect(mapNavobotCategory("basura sa kanto", "", codes)).toBe("CIV_WASTE");
    expect(mapNavobotCategory("emr_flood", "", codes)).toBe("EMR_FLOOD");
    expect(mapNavobotCategory("Other", "may nakaparada sa fire lane", codes)).toBe("TRF_EMERGENCY_ROUTE");
    expect(navobotClientId("c1", "x", "y")).toBe(navobotClientId("c1", "x", "y"));
    expect(navobotClientId("c1", "x", "y")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("broadcast advisories", () => {
  it("targets residents of the selected barangay only", async () => {
    const target = await queryOne<{ id: string }>(`SELECT barangay_id AS id FROM users WHERE role = 'citizen' AND full_name = 'Maria Santos'`);
    const adv = await queryOne<{ id: string }>(
      `INSERT INTO advisories (title, body_en, body_fil, severity, target_barangay_ids, channels) VALUES ('Test', 'en', 'fil', 'warning', $1, '{push,sms}') RETURNING id`, [[target!.id]]);
    sms.length = 0;
    const n = await deliverAdvisory(adv!.id);
    expect(n).toBe(1);
    expect(sms).toHaveLength(1);
    expect(sms[0]!.to).toBe("+639170000002");
  });
});
