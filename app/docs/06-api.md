# NavoPulse REST API Reference

Base URL: `{APP_URL}/api` (local: `http://localhost:3000/api`). Every route listed here exists under `apps/web/src/app/api/**/route.ts`. A machine-readable OpenAPI 3.1 document is served at `/api/openapi.json`.

## 1. Conventions

**Auth.** Sign in through `/api/auth/login` (staff) or `/api/auth/otp/verify` (citizens). Both set an `np_session` cookie (httpOnly, SameSite=Lax, Secure in production) and return the same JWT as `token`. Send it either as the cookie or as `Authorization: Bearer <token>`. The JWT points to a row in `sessions`, so logout, disabling a user, or changing their role/password revokes it immediately. Lifetime: staff 12 h, citizens 30 days.

**Permissions** (from `src/lib/rbac.ts`). "Auth" columns below name the permission checked.

| Permission | Roles |
|---|---|
| `incident.read` | drrmo_dispatcher, tmo_officer, pio_admin, field_responder, super_admin |
| `incident.manage` | drrmo_dispatcher, tmo_officer, pio_admin, super_admin |
| `incident.respond` | field_responder, drrmo_dispatcher, tmo_officer, super_admin |
| `incident.create_walkin` | drrmo_dispatcher, tmo_officer, pio_admin, super_admin |
| `pii.reveal` | drrmo_dispatcher, tmo_officer, field_responder, super_admin |
| `units.read` | drrmo_dispatcher, tmo_officer, field_responder, super_admin |
| `units.manage` | drrmo_dispatcher, tmo_officer, super_admin |
| `broadcast.send` | drrmo_dispatcher, pio_admin, super_admin |
| `content.manage` | pio_admin, super_admin |
| `analytics.read` | drrmo_dispatcher, tmo_officer, pio_admin, super_admin |
| `notifications.read` | drrmo_dispatcher, pio_admin, super_admin |
| `sms.read` | drrmo_dispatcher, super_admin |
| `users.manage`, `audit.read` | super_admin |
| `settings.manage` | super_admin (defined, not used by any route yet) |
| `citizen.self` | citizen |

**Office scope.** Every incident read/write is further limited (`scopeSql` in `src/lib/incidents.ts`): DRRMO and TMO see incidents whose category `default_office` is their office; PIO sees `default_office = PIO` **plus all `source = navobot`**; a field responder sees only incidents with `assigned_unit_id` = their unit; super admin sees all. An incident outside scope answers **404** (not 403) so its existence is not disclosed.

**Errors.** JSON `{ "error": "<message>", "details": <optional> }`.

| Status | When |
|---|---|
| 400 | Body not JSON, zod validation (`details: [{path, message}]`), business rule (e.g. "Use the assign action…") |
| 401 | Not signed in, bad credentials, bad webhook auth, OTP wrong/expired |
| 403 | Signed in but lacks the permission or role restriction |
| 404 | Unknown/out-of-scope ID, malformed UUID in the path |
| 405 | Content type does not allow create/delete |
| 409 | Status transition not allowed, rating before resolution, duplicate email |
| 413 / 415 | Upload too large / not JPEG, PNG, WebP |
| 422 | Location outside Navotas; NavoBot ticket without location or barangay |
| 429 | Rate limit; `details.retryAfterSeconds` (no `Retry-After` header is sent) |
| 500 | Unexpected error (logged server-side as `[api] unhandled error`) |
| 502 | Copilot Studio / Direct Line unreachable (token route) |
| 503 | `/api/health` when the database is down |

**Rate limits** are in-process fixed windows (single instance), keyed as shown per route. Client IP comes from `X-Forwarded-For` (first entry) or `X-Real-IP`.

**IDs** are UUIDs; timestamps are ISO 8601 UTC; coordinates are WGS84 decimal degrees (`lat`, `lng`).

---

## 2. Health and public data (no auth)

| Method & path | Description | Response |
|---|---|---|
| `GET /api/health` | DB ping | `200 {status:"ok", db:"ok", latencyMs, time}` or `503 {status:"degraded", db:"down", …}` |
| `GET /api/public/config` | Runtime config for the PWA | `{smsGatewayNumber, hotlines:{national, drrmo, pnp, bfp}, navobot:{mode:"directline"\|"demo"}}`. Hotlines come from `NEXT_PUBLIC_HOTLINE_*`; unset values return placeholder text, and `smsGatewayNumber` defaults to the placeholder `+639000000000` |
| `GET /api/public/categories` | Active incident categories by `sort_order` | `{categories:[{id, code, name_en, name_fil, module, default_office, priority, color}]}` (cached 5 min) |
| `GET /api/public/barangays[?geo=1]` | Barangay directory; `geo=1` adds `boundary` GeoJSON | `{barangays:[{id, name, district, hotline, address, officials, population, lat, lng, boundary?}]}` (cached 5 min) |
| `GET /api/public/advisories[?barangayId=]` | Active advisories (not expired, sent within 14 days), city-wide plus the given barangay, critical first | `{advisories:[{id, title, body_en, body_fil, severity, sent_at, expires_at, barangays:[names]}]}` |
| `GET /api/public/content` | Angat Navotas | `{announcements:[…30], events:[upcoming…30], businesses:[…]}` |
| `GET /api/public/transit` | Active routes with path GeoJSON and stops | `{routes:[{id, code, name, mode, origin, destination, fare_min, fare_notes, description, path, stops:[{name, kind, lat, lng}]}]}` |

## 3. Authentication

### POST /api/auth/login (staff)
- Rate limit: 10 per IP per 5 min.
- Body: `{ "email": "dispatch@navopulse.local", "password": "NavoPulse!2026" }`
- 200: `{ user:{id, role, fullName}, token }` + `Set-Cookie: np_session=…`
- 401 `Incorrect email or password` (also for disabled accounts and citizen accounts). Success and failure are audit-logged (`auth.login`, `auth.login_failed`).

### POST /api/auth/logout
- Any or no session. Revokes the current session, clears the cookie. `200 {ok:true}`.

### GET /api/auth/me
- `200 {user:null}` when signed out, else `{user:{id, role, fullName, email, barangayId, unitId, preferredLanguage}, permissions:[…]}`.

### POST /api/auth/otp/request (citizen)
- Rate limit: 10 per IP and 3 per number per 15 min.
- Body: `{ "mobileNumber": "0917 000 0001" }`. Accepts `09…`, `639…`, `+639…`, spaces, dashes, brackets; normalised to `+639XXXXXXXXX`.
- 200: `{ ok:true, expiresInSeconds:300, devCode?:"123456" }`. `devCode` is present when `NODE_ENV !== "production"` or `NAVOPULSE_DEMO_OTP=1`. The code is also sent by SMS through the configured provider.

### POST /api/auth/otp/verify (citizen)
- Rate limit: 20 per IP per 15 min. Max 5 wrong attempts per code.
- Body:

```json
{
  "mobileNumber": "+639170000001",
  "code": "123456",
  "fullName": "Juan Dela Cruz",
  "barangayId": "uuid",
  "preferredLanguage": "fil",
  "privacyConsent": true
}
```
  `fullName`, `barangayId`, `preferredLanguage`, `privacyConsent` are only needed for a first-time number.
- 200: `{ user:{id, role:"citizen", fullName}, isNew, token }` + cookie.
- 400 `Please accept the privacy notice to register` with `details.needsRegistration = true` (the code stays valid so the client can show the registration form and resubmit).
- 401 `Incorrect code` / `Code expired. Request a new one.`; 403 for staff numbers or disabled accounts.

## 4. Citizen endpoints (`citizen.self` unless noted)

| Method & path | Body | Response / notes |
|---|---|---|
| `GET /api/me/incidents` | — | `{incidents:[{id, control_number, status, module, created_at, resolved_at, category_code, name_en, name_fil, description(160), barangay, rating}]}` (latest 200) |
| `GET /api/me/incidents/{id}` | — | `{incident:{…, lat, lng, resolution_note, duplicate_of_control_number, rating, comment, history:[{to_status, created_at}], media:[{id, type}]}}`. Internal notes are never included. 404 if not the caller's |
| `POST /api/me/incidents/{id}/feedback` | `{rating:1-5, comment?:≤1000}` | `{feedback:{rating, comment}}`; 409 unless status is `resolved`; re-rating replaces |
| `POST /api/me/device-tokens` | `{platform:"android"\|"ios"\|"web", token}` | 201 `{ok:true}`. Auth: any signed-in user. Upsert by token |
| `DELETE /api/me/device-tokens` | `{token}` | `{ok:true}` |
| `GET /api/me/notifications` | — | Auth: any signed-in user. `{notifications:[{id, kind, payload:{title, body, data}, incident_id, advisory_id, read_at, created_at}], unread}` (in-app channel, latest 50) |
| `POST /api/me/notifications` | — | Marks all as read |

## 5. Incidents

### POST /api/incidents (create)
- Auth: `citizen.self` (source `app`, reporter = caller) or `incident.create_walkin` (source `walk_in`, no reporter, audit `incident.create_walkin`).
- Rate limit: 20 per user per 10 min.
- Body (`createIncidentSchema`):

```json
{
  "clientId": "2b6f0c1e-8f8a-4d3e-9c65-2f0a1d7e4b11",
  "categoryCode": "EMR_FLOOD",
  "description": "Hanggang baywang na ang tubig, may matanda sa bahay",
  "location": { "lat": 14.6688, "lng": 120.9398, "accuracy": 12 },
  "addressText": "Near San Jose Church",
  "peopleAffected": 3,
  "observedAt": "2026-10-19T08:15:00+08:00",
  "locationSource": "device",
  "mediaIds": []
}
```
  `clientId` UUID required; `categoryCode` must be an active code (see `/api/public/categories`); `description` ≤ 2000 (default ""); `locationSource` `device|exif|manual`; `peopleAffected` 0 to 100000; up to 5 `mediaIds` uploaded by the same user (`type=report`, not yet attached).
- 201 `{id, controlNumber, status:"submitted", module, created:true}`; **200** with `created:false` when `clientId` already exists (idempotent retry, including a report already received by SMS).
- 400 unknown category; 422 point outside `lat 14.62–14.72, lng 120.90–120.98`.

### GET /api/incidents (list / map feed)
- Auth: `incident.read`; scoped.
- Query: `module`, `status` (comma list), `source` (comma list), `priority` (comma list), `barangayId`, `category` (code), `from`, `to` (YYYY-MM-DD Manila days), `q` (control number or description contains), `limit` (1 to 10000, default 500).
- Order: open first, then priority (critical→low), then newest.
- 200 `{incidents:[{id, control_number, status, priority, module, source, category_code, category_name, color, description(160), lat, lng, barangay, unit, people_affected, created_at}]}`. No reporter data.

### GET /api/incidents/stream (SSE)
- Auth: `incident.read`. `Content-Type: text/event-stream`.
- Events: `event: ready` once; `event: incident` with `{op:"INSERT"|"UPDATE", id, module, status, priority, controlNumber}` for each change the viewer may see; a `: ping` comment every 25 s.
- Browser: `new EventSource("/api/incidents/stream")` (cookie auth). Fetch details with `GET /api/incidents/{id}` after an event.

### GET /api/incidents/{id}
- Auth: `incident.read`; scoped.
- 200 `{incident:{…all fields, lat, lng, category_code, category_name, color, default_office, barangay_id, barangay, unit_name, unit_contact, duplicate_of_control_number, feedback_rating, feedback_comment, reporter:{name, mobile, masked, canReveal, registered}, history:[…], notes:[…], media:[{id, type, mime_type, exif_lat, exif_lng, exif_taken_at, created_at}], possibleDuplicates:[{id, control_number, status, created_at, distance_m}]}}`
- Reporter masking: dispatcher, TMO officer, super admin see full name/mobile (logged as `pii.view` when present). PIO admin and responders get masked values (`J*** D*** C***`, `+63 917 *** 0001`); `canReveal` is true for responders.

### POST /api/incidents/{id}/reveal
- Auth: `pii.reveal`; scoped. No body. Always audit-logged as `pii.reveal`.
- 200 `{reporter:{name, mobile}}`.

### POST /api/incidents/{id}/status
- Auth: `incident.manage` or `incident.respond`; scoped.
- Body: `{status, note?:≤1000}`. Allowed targets here: `verified`, `in_progress`, `rejected` (and `submitted` is never a target). `assigned`, `duplicate`, `resolved` return 400 pointing to the dedicated action. Responders may only set `in_progress`.
- 200 `{status}`; 409 `Cannot move from X to Y`. Notifies the reporter; audit `incident.status_change`.

### POST /api/incidents/{id}/assign
- Auth: `incident.manage`; scoped. Body `{unitId, note?}`.
- Allowed from submitted, verified, assigned, in_progress. Sets `assigned` (stays `in_progress` if already in progress), marks the unit unavailable. Does not check that the unit belongs to the same office.
- 200 `{status, unit:{id, name}}`; 400 unknown unit; 409 terminal incident.

### POST /api/incidents/{id}/merge
- Auth: `incident.manage`; both incidents must be in scope. Body `{duplicateOfId, note?}`.
- Marks this incident `duplicate`, sets `duplicate_of_id`, adds a note on the original, notifies the reporter "Tracked under …".
- 400 self-merge or target is itself a duplicate; 409 not allowed from current status.

### POST /api/incidents/{id}/notes
- Auth: `incident.manage` or `incident.respond`; scoped. Body `{body:1-2000}`. 201 `{note:{id, created_at}}`. Staff-only, never shown to citizens.

### POST /api/incidents/{id}/resolve
- Auth: `incident.manage` or `incident.respond`; scoped. Body `{note:1-2000, mediaIds?:[≤5]}` (resolution photos uploaded by the caller with `type=resolution`).
- Allowed from verified, assigned, in_progress. Frees the unit if it has no other active case. Notifies the reporter with a rating request (`kind=feedback_request`).
- 200 `{status:"resolved"}`.

## 6. Media

### POST /api/media
- Auth: any signed-in user. Rate limit 30 per user per 10 min.
- `multipart/form-data`: `file` (required, ≤ 5 MB, JPEG/PNG/WebP by magic bytes), `type` = `report` (default) or `resolution` (staff with `incident.respond` or `incident.manage` only), optional `exifLat`, `exifLng`, `exifTakenAt` (ISO) extracted on the device before compression.
- 201 `{media:{id, type, mime_type}}`. Attach it by passing the id in `mediaIds` when creating or resolving.

```bash
curl -X POST "$BASE/api/media" -H "Authorization: Bearer $TOKEN" \
  -F file=@photo.jpg -F type=report -F exifLat=14.6688 -F exifLng=120.9398 -F exifTakenAt=2026-10-19T08:10:00+08:00
```

### GET /api/media/{id}
- Auth: signed in, and one of: uploader; the incident's reporter; staff with `incident.read` who can see the incident. Others get 404.
- Returns the image bytes (`Cache-Control: private, max-age=3600`, `X-Content-Type-Options: nosniff`).

## 7. Units

| Method & path | Auth | Body | Notes |
|---|---|---|---|
| `GET /api/units` | `units.read` | — | DRRMO/TMO users see their office's units; responders and super admin see all. `{units:[{id, name, office, type, contact, is_available, lat, lng, active_incidents}]}` |
| `POST /api/units` | `units.manage` | `{name, office:"DRRMO"\|"TMO", type, contact?}` | 201 `{unit}`; audit `unit.create`. Office is not restricted to the caller's own office |
| `PATCH /api/units/{id}` | `units.manage` or `incident.respond` | `{isAvailable?, contact?, location?:{lat, lng}}` | Responders may only update their own unit; audit `unit.update` |

## 8. Broadcasts, logs, inquiries, analytics

### POST /api/advisories
- Auth: `broadcast.send`. Rate limit 10 per user per 10 min.
- Body:

```json
{
  "title": "Tidal flood warning",
  "bodyEn": "High tide expected this afternoon. Avoid coastal streets.",
  "bodyFil": "Inaasahan ang high tide mamayang hapon. Iwasan ang mga kalye malapit sa dagat.",
  "severity": "warning",
  "barangayIds": [],
  "channels": ["push", "sms"]
}
```
  `barangayIds: []` = city-wide. Expires 2 days after sending (fixed).
- Delivery is synchronous: every active citizen in the target gets an in-app notification; push if `push` selected and they have a device token; SMS if `sms` selected, or as fallback for `critical` when push did not succeed.
- 201 `{id, recipients}`; audit `advisory.broadcast`.

### GET /api/advisories
- Auth: `broadcast.send` or `analytics.read`. Latest 100 with sender and barangay names.

### GET /api/notifications[?channel=push|sms|in_app]
- Auth: `notifications.read`. Latest 300 delivery attempts (OTP rows excluded): `{id, channel, kind, status, error, created_at, sent_at, title, body, control_number, advisory, recipient}`.

### GET /api/sms
- Auth: `sms.read`. Latest 300 inbound/outbound SMS with masked `phone`, OTP bodies shown as `[OTP redacted]`, `parse_error`, linked `control_number`.

### GET /api/inquiries
- Auth: `incident.manage` or `analytics.read`. Latest 300 NavoBot inquiries with the incident each became (`incident_control_number`). Not office-scoped.

### GET /api/analytics/summary[?from=YYYY-MM-DD&to=YYYY-MM-DD]
- Auth: `analytics.read`; scoped like incidents. Default range: last 30 Manila days.
- 200 `{range, totals:{total, open, resolved, emergencies, navobot_tickets}, byStatus, byCategory, byBarangay, bySource, daily, times:[{module, avg_response_min, median_response_min, avg_resolution_h, resolved}], satisfaction:{avg_rating, responses, resolved}, ratingDist, inquiries:{total, converted}}`.
- Response time = created → first of verified/assigned. Inquiry counts are city-wide (not scoped).

### GET /api/analytics/export[?from&to&format=csv|xlsx]
- Auth: `analytics.read`; scoped. Audit `analytics.export`.
- Columns: `control_number, category, module, source, status, priority, barangay, lat, lng, people_affected, assigned_unit, reported_at, resolved_at, response_min, resolution_h, rating`. **No names or mobile numbers.** CSV has a UTF-8 BOM and neutralises formula injection (`=`, `+`, `-`, `@` prefixed with `'`).
- PDF export is not implemented in the API.

## 9. Administration (super admin; content: PIO)

| Method & path | Auth | Body | Notes |
|---|---|---|---|
| `GET /api/admin/users` | `users.manage` | — | Staff first, up to 1000; `has_mobile` instead of the number |
| `POST /api/admin/users` | `users.manage` | `{fullName, email, role, password:≥10, isActive?, unitId?}` | Staff only (citizen → 400); 409 duplicate email; bcrypt cost 12; audit `user.create` |
| `PATCH /api/admin/users/{id}` | `users.manage` | `{role?, isActive?, password?:≥10, unitId?:uuid\|null}` | Cannot disable/demote self; cannot switch citizen↔staff; revokes sessions on role/active/password change; audit `user.update` |
| `GET /api/audit[?action=prefix]` | `audit.read` | — | Latest 500, e.g. `?action=pii.` |
| `GET /api/admin/content/{type}` | `content.manage` | — | `type` ∈ `announcements`, `events`, `businesses`, `transit_routes`, `barangays` (up to 500 items) |
| `POST /api/admin/content/{type}` | `content.manage` | per type (below) | 201 `{id}`; barangays → 405; audit `content.create` |
| `PATCH /api/admin/content/{type}/{id}` | `content.manage` | partial of the same fields | audit `content.update` with before/after |
| `DELETE /api/admin/content/{type}/{id}` | `content.manage` | — | barangays → 405; audit `content.delete` |

Content fields (`src/lib/content.ts`):
- `announcements`: `titleEn, titleFil (3–200), bodyEn, bodyFil (3–5000), imageUrl?, isPublished`
- `events`: `title, description, venue?, barangayId?, startsAt, endsAt? (ISO with offset), location?{lat 14.5–14.8, lng 120.8–121.1}, isPublished`
- `businesses`: `name, category, description, address?, contact?, barangayId?, location?, isPublished`
- `transit_routes`: `code, name, mode (jeepney|bus|tricycle|pedicab|ferry|uv_express), origin, destination, fareMin?, fareNotes?, description, isActive` (route path and stops are not editable through the API)
- `barangays` (PATCH only): `hotline?, address?, population?, officials?[{position, name, contact?}] (≤30)`

## 10. Integrations

### 10.1 POST /api/integrations/navobot/tickets

Called by the Power Automate flow (see `05-navobot-copilot-studio.md`). No session; authenticated by one of:

1. `X-Api-Key: <NAVOBOT_API_KEY>`: checked only when `NAVOBOT_API_KEY` is set on the server (no default). If the variable is unset, the header is ignored and HMAC is required.
2. `X-NavoPulse-Timestamp: <unix seconds>` + `X-NavoPulse-Signature: sha256=<hex HMAC-SHA256(NAVOBOT_WEBHOOK_SECRET, "<timestamp>.<raw body>")>`. Rejected if the timestamp differs from server time by more than 300 s. Sign the **exact bytes** you send.

Rate limit: 120 per IP per minute.

Body (`navobotTicketSchema`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `conversationId` | string 1–200 | yes | Copilot conversation ID; part of the idempotency key |
| `category` | string 1–80 | yes | A category code (`CIV_WASTE`) or free text ("basura", "nakaparada", "sunog"); mapped by `mapNavobotCategory`, fallback `CIV_OTHER` |
| `description` | string 1–2000 | yes | Also used for category keyword matching |
| `location` | `{lat, lng, accuracy?}` | one of location/barangay | |
| `barangay` | string ≤ 80 | one of location/barangay | Matched case-insensitively, ignoring spaces, or by prefix; its centroid is used when no `location` (`location_source = barangay_centroid`) |
| `addressText` | string ≤ 300 | no | |
| `citizen.name` / `citizen.mobileNumber` | string ≤ 120 / ≤ 20 | no | Encrypted at rest; a valid PH number that matches a citizen account links the report to that account |
| `language` | `en`\|`fil`\|`taglish` | no | Informational |
| `transcriptUrl` | URL | no | Stored on the inquiry |

Responses:
- **201** new / **200** retry: `{ok:true, created, incidentId, controlNumber, inquiryControlNumber, category, status, trackUrl, reply_en, reply_fil}`. `trackUrl` is `{APP_URL}/app/reports`.
- **422** no usable location: `{error, details:{reply_en, reply_fil}}`.
- **401** `Invalid webhook credentials`; **400** invalid JSON or validation.

Idempotency: the server derives `clientId` from SHA-256 of `navobot|conversationId|category|description`, so the same ticket sent twice returns the same control number.

Note: the location is not checked against the Navotas bounding box on this route (only `POST /api/incidents` checks it).

**curl with API key** (server started with `NAVOBOT_API_KEY=demo-navobot-key`):

```bash
BASE=http://localhost:3000
curl -sS -X POST "$BASE/api/integrations/navobot/tickets" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: demo-navobot-key" \
  -d '{
    "conversationId": "demo-conv-001",
    "category": "basura",
    "description": "Tambak ng basura sa gilid ng kanal malapit sa simbahan",
    "barangay": "San Jose",
    "citizen": { "name": "Juan Dela Cruz", "mobileNumber": "09170000001" },
    "language": "taglish"
  }'
```

**curl with HMAC** (dev default secret `dev-navobot-secret`):

```bash
BASE=http://localhost:3000
export NAVOBOT_WEBHOOK_SECRET=dev-navobot-secret
BODY='{"conversationId":"demo-conv-002","category":"illegal parking","description":"Nakaparada sa emergency route papuntang evacuation center","location":{"lat":14.6812,"lng":120.9358},"language":"taglish"}'
TS=$(date +%s)
SIG=$(node -e 'const c=require("crypto");const[ts,b]=process.argv.slice(1);process.stdout.write("sha256="+c.createHmac("sha256",process.env.NAVOBOT_WEBHOOK_SECRET).update(ts+"."+b).digest("hex"))' "$TS" "$BODY")
curl -sS -X POST "$BASE/api/integrations/navobot/tickets" \
  -H "Content-Type: application/json" \
  -H "X-NavoPulse-Timestamp: $TS" \
  -H "X-NavoPulse-Signature: $SIG" \
  --data-raw "$BODY"
```

Same signature with OpenSSL instead of Node:

```bash
SIG="sha256=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$NAVOBOT_WEBHOOK_SECRET" | sed 's/^.*= //')"
```

**Missing location test** (expect 422 with `details.reply_fil`):

```bash
curl -sS -X POST "$BASE/api/integrations/navobot/tickets" -H "Content-Type: application/json" \
  -H "X-Api-Key: demo-navobot-key" -d '{"conversationId":"demo-conv-003","category":"streetlight","description":"Patay ang ilaw"}'
```

### 10.2 POST /api/integrations/sms/inbound

Called by the SMS provider for each message to the gateway number.

- Auth: header `X-Webhook-Secret: <SMS_INBOUND_SECRET>` or query `?secret=` for providers that cannot set headers (dev default `dev-sms-inbound-secret`). Optional `?provider=` sets the provider name used for deduplication.
- Body: JSON `{from | mobile_number, body | message | text, messageId?, provider?}` or form posts (`From`, `Body`, `MessageSid`, as Twilio sends).
- Rate limit: 10 per sender number per 10 min.
- Payload format (`packages/shared/src/smsPayload.ts`), one 160-character segment:

```
NVP1 SOS <FLD|FIR|MED|OTH> <lat>,<lng> P<people> R<32-hex clientId> N:<note>
NVP1 SOS FLD 14.66712,120.94231 P3 R7f3a9c2e1b4d4e0f8a6b5c4d3e2f1a0b N:Stranded sa bubong, may matanda
```
  Case-insensitive; `P` (default 1), `R` and `N:` are optional, so a hand-typed `NVP1 SOS FLD 14.667,120.942` works.
- Responses (always 200 for parsed/unparsed so providers do not retry): `{ok:true, created, incidentId, controlNumber}`; `{ok:true, duplicate:true, incidentId}` for a repeated `messageId`; `{ok:false, error:"Missing or invalid coordinates"}` etc. for unparseable bodies (sender gets an SMS telling them to call 911 if the body starts with `NVP`). 401 bad secret, 400 missing sender/body.
- Side effects: inbound row in `sms_messages` (number encrypted), incident with `source=sms`, `location_source=sms`, category `EMR_FLOOD|EMR_FIRE|EMR_MEDICAL|EMR_OTHER`, link to a citizen account with the same number, acknowledgement SMS with the control number.
- No Navotas bounding-box check on this route.

```bash
BASE=http://localhost:3000
curl -sS -X POST "$BASE/api/integrations/sms/inbound" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: dev-sms-inbound-secret" \
  -d '{"from":"09170000002","messageId":"demo-sms-0001","provider":"demo",
       "body":"NVP1 SOS FLD 14.66712,120.94231 P3 R7f3a9c2e1b4d4e0f8a6b5c4d3e2f1a0b N:Stranded sa bubong, may matanda"}'

# Twilio-style form post with the secret in the query string
curl -sS -X POST "$BASE/api/integrations/sms/inbound?secret=dev-sms-inbound-secret&provider=twilio" \
  --data-urlencode "From=+639170000003" --data-urlencode "Body=NVP1 SOS MED 14.6492,120.9478 P1 N:Nahimatay si lola" \
  --data-urlencode "MessageSid=SM00000000000000000000000000000001"
```

## 11. NavoBot chat

| Method & path | Auth | Description |
|---|---|---|
| `GET /api/navobot/token` | none; 30 per IP per 10 min | With `COPILOT_TOKEN_ENDPOINT`: proxies it → `{token}`. With `DIRECTLINE_SECRET`: calls Direct Line `tokens/generate` → `{token, expiresIn}`. Neither: **404** "NavoBot is not connected to Copilot Studio; using demo mode". Upstream failure: 502 |
| `POST /api/navobot/demo-chat` | none; 60 per IP per min | Body `{message:≤1000}` → `{text, suggestions?, action?:"sos"\|"report"\|"transport"\|"directory"}`. Rule-based: emergency words → SOS/911; flood words → current advisories from DB (or "no active advisory"); report words → Report a concern; transit → active routes; barangay → hotline from DB; permits → Citizen's Charter pointer; else "I don't know and I won't guess" |

## 12. Route index

| Area | Routes |
|---|---|
| Health/public | `GET /api/health`, `GET /api/public/{config,categories,barangays,advisories,content,transit}` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/otp/request`, `POST /api/auth/otp/verify` |
| Citizen | `GET /api/me/incidents`, `GET /api/me/incidents/{id}`, `POST /api/me/incidents/{id}/feedback`, `POST\|DELETE /api/me/device-tokens`, `GET\|POST /api/me/notifications` |
| Incidents | `GET\|POST /api/incidents`, `GET /api/incidents/stream`, `GET /api/incidents/{id}`, `POST /api/incidents/{id}/{status,assign,merge,notes,resolve,reveal}` |
| Media | `POST /api/media`, `GET /api/media/{id}` |
| Units | `GET\|POST /api/units`, `PATCH /api/units/{id}` |
| Alerts/logs | `GET\|POST /api/advisories`, `GET /api/notifications`, `GET /api/sms`, `GET /api/inquiries`, `GET /api/audit` |
| Analytics | `GET /api/analytics/summary`, `GET /api/analytics/export` |
| Admin | `GET\|POST /api/admin/users`, `PATCH /api/admin/users/{id}`, `GET\|POST /api/admin/content/{type}`, `PATCH\|DELETE /api/admin/content/{type}/{id}` |
| Integrations | `POST /api/integrations/navobot/tickets`, `POST /api/integrations/sms/inbound` |
| NavoBot | `GET /api/navobot/token`, `POST /api/navobot/demo-chat` |
