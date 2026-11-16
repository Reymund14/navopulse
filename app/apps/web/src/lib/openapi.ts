import {
  advisorySchema, assignSchema, createIncidentSchema, deviceTokenSchema, feedbackSchema, mergeSchema, navobotTicketSchema, noteSchema,
  otpRequestSchema, otpVerifySchema, resolveSchema, staffLoginSchema, statusChangeSchema,
} from "@navopulse/shared";
import { z, type ZodType } from "zod";

/**
 * OpenAPI 3.1 document generated from the same Zod schemas the routes use for
 * validation, so request bodies here cannot drift from the code.
 * Served at GET /api/openapi.json (paste into https://editor.swagger.io).
 */
type Op = { summary: string; tag: string; auth?: string; body?: ZodType; params?: string[]; query?: string[]; ok?: number };

const OPS: Record<string, Record<string, Op>> = {
  "/api/auth/login": { post: { summary: "Staff sign-in (email + password). Sets np_session cookie and returns a Bearer token.", tag: "Auth", body: staffLoginSchema } },
  "/api/auth/otp/request": { post: { summary: "Send a 6-digit OTP to a PH mobile number (devCode returned in development).", tag: "Auth", body: otpRequestSchema } },
  "/api/auth/otp/verify": { post: { summary: "Verify OTP; registers new citizens (privacyConsent required).", tag: "Auth", body: otpVerifySchema } },
  "/api/auth/logout": { post: { summary: "Revoke the current session.", tag: "Auth", auth: "any" } },
  "/api/auth/me": { get: { summary: "Current user and permissions.", tag: "Auth" } },
  "/api/public/barangays": { get: { summary: "Barangay directory; ?geo=1 adds boundary GeoJSON.", tag: "Public", query: ["geo"] } },
  "/api/public/categories": { get: { summary: "Incident categories.", tag: "Public" } },
  "/api/public/advisories": { get: { summary: "Active advisories (city-wide + barangay).", tag: "Public", query: ["barangayId"] } },
  "/api/public/content": { get: { summary: "Angat Navotas: announcements, events, businesses.", tag: "Public" } },
  "/api/public/transit": { get: { summary: "Transport Hub routes and stops.", tag: "Public" } },
  "/api/public/config": { get: { summary: "Client config: SMS gateway number, hotlines, NavoBot mode.", tag: "Public" } },
  "/api/health": { get: { summary: "Liveness and database check.", tag: "Public" } },
  "/api/incidents": {
    get: { summary: "List/map incidents in the caller's scope.", tag: "Incidents", auth: "incident.read", query: ["module", "status", "source", "priority", "barangayId", "category", "from", "to", "q", "limit"] },
    post: { summary: "Create a report (citizen: source app; staff: walk-in). Idempotent on clientId.", tag: "Incidents", auth: "citizen.self | incident.create_walkin", body: createIncidentSchema, ok: 201 },
  },
  "/api/incidents/{id}": { get: { summary: "Incident detail with timeline, notes, media, possible duplicates; reporter masked by role.", tag: "Incidents", auth: "incident.read", params: ["id"] } },
  "/api/incidents/{id}/status": { post: { summary: "Change status (verify, start, reject).", tag: "Incidents", auth: "incident.manage | incident.respond", body: statusChangeSchema, params: ["id"] } },
  "/api/incidents/{id}/assign": { post: { summary: "Assign a response unit.", tag: "Incidents", auth: "incident.manage", body: assignSchema, params: ["id"] } },
  "/api/incidents/{id}/merge": { post: { summary: "Close as duplicate of another incident.", tag: "Incidents", auth: "incident.manage", body: mergeSchema, params: ["id"] } },
  "/api/incidents/{id}/notes": { post: { summary: "Add an internal note.", tag: "Incidents", auth: "incident.manage | incident.respond", body: noteSchema, params: ["id"], ok: 201 } },
  "/api/incidents/{id}/resolve": { post: { summary: "Resolve with note and resolution photos; notifies the reporter.", tag: "Incidents", auth: "incident.manage | incident.respond", body: resolveSchema, params: ["id"] } },
  "/api/incidents/{id}/reveal": { post: { summary: "Reveal masked reporter contact (audit-logged).", tag: "Incidents", auth: "pii.reveal", params: ["id"] } },
  "/api/incidents/stream": { get: { summary: "Server-Sent Events: incident inserts/updates in the caller's scope.", tag: "Incidents", auth: "incident.read" } },
  "/api/media": { post: { summary: "Upload a photo (multipart: file, type=report|resolution, exifLat, exifLng, exifTakenAt). JPEG/PNG/WebP ≤ 5 MB.", tag: "Media", auth: "any", ok: 201 } },
  "/api/media/{id}": { get: { summary: "Download a photo (uploader, reporter, or staff in scope).", tag: "Media", auth: "any", params: ["id"] } },
  "/api/me/incidents": { get: { summary: "The citizen's own reports.", tag: "Citizen", auth: "citizen.self" } },
  "/api/me/incidents/{id}": { get: { summary: "Own report with status history and media.", tag: "Citizen", auth: "citizen.self", params: ["id"] } },
  "/api/me/incidents/{id}/feedback": { post: { summary: "Rate a resolved report 1–5.", tag: "Citizen", auth: "citizen.self", body: feedbackSchema, params: ["id"] } },
  "/api/me/device-tokens": { post: { summary: "Register an FCM token.", tag: "Citizen", auth: "any", body: deviceTokenSchema, ok: 201 } },
  "/api/me/notifications": { get: { summary: "In-app inbox. POST marks all read.", tag: "Citizen", auth: "any" } },
  "/api/units": { get: { summary: "Response units with load.", tag: "Dispatch", auth: "units.read" } },
  "/api/advisories": {
    get: { summary: "Sent advisories.", tag: "Broadcast", auth: "broadcast.send | analytics.read" },
    post: { summary: "Broadcast an advisory by push and/or SMS to all or selected barangays.", tag: "Broadcast", auth: "broadcast.send", body: advisorySchema, ok: 201 },
  },
  "/api/analytics/summary": { get: { summary: "KPIs, breakdowns, response/resolution times, satisfaction.", tag: "Analytics", auth: "analytics.read", query: ["from", "to"] } },
  "/api/analytics/export": { get: { summary: "Incident export as CSV or Excel (format=xlsx). No personal data.", tag: "Analytics", auth: "analytics.read", query: ["from", "to", "format"] } },
  "/api/integrations/navobot/tickets": { post: { summary: "Power Automate → create ticket from NavoBot. Auth: X-Api-Key or X-NavoPulse-Timestamp + X-NavoPulse-Signature (HMAC-SHA256).", tag: "Integrations", body: navobotTicketSchema, ok: 201 } },
  "/api/integrations/sms/inbound": { post: { summary: "SMS provider webhook for the offline SOS payload. Auth: X-Webhook-Secret or ?secret=.", tag: "Integrations" } },
  "/api/navobot/token": { get: { summary: "Short-lived Direct Line token for the embedded Web Chat.", tag: "Integrations" } },
};

export function openApiDocument(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, methods] of Object.entries(OPS)) {
    paths[path] = {};
    for (const [method, op] of Object.entries(methods)) {
      paths[path][method] = {
        summary: op.summary,
        tags: [op.tag],
        ...(op.auth ? { security: [{ bearer: [] }, { cookie: [] }], description: `Requires permission: ${op.auth}` } : {}),
        parameters: [
          ...(op.params ?? []).map((name) => ({ name, in: "path", required: true, schema: { type: "string", format: "uuid" } })),
          ...(op.query ?? []).map((name) => ({ name, in: "query", required: false, schema: { type: "string" } })),
        ],
        ...(op.body ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(op.body, { io: "input", unrepresentable: "any" }) } } } } : {}),
        responses: {
          [String(op.ok ?? 200)]: { description: "OK" },
          400: { description: "Validation failed" },
          ...(op.auth ? { 401: { description: "Sign in required" }, 403: { description: "Not allowed for this role" } } : {}),
          429: { description: "Rate limited" },
        },
      };
    }
  }
  return {
    openapi: "3.1.0",
    info: { title: "NavoPulse API", version: "0.1.0", description: "REST API for the NavoPulse citizen app, LGU dashboard, NavoBot and SMS gateway." },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        cookie: { type: "apiKey", in: "cookie", name: "np_session" },
      },
    },
    paths,
  };
}
