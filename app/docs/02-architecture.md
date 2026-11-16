# NavoPulse System Architecture

## 1. Overview

NavoPulse runs as **one Next.js 16 application** (`apps/web`) that serves three surfaces from the same process and the same database:

| Path | Surface | Users |
|---|---|---|
| `/app` | Citizen PWA (installable, offline queue, SMS fallback) | Residents, guests |
| `/dashboard` | LGU Web Command Dashboard | DRRMO, TMO, responders, PIO, super admin |
| `/api` | REST API, webhooks, SSE stream | PWA, dashboard, Power Automate, SMS provider |

Key decisions:

- **PostgreSQL 16 + PostGIS**, schema in raw SQL migrations (`apps/web/db/migrations`). There is no ORM because the most important queries are spatial (`ST_Contains`, `ST_DWithin`, nearest centroid, Voronoi seeding, GeoJSON output).
- **Realtime** = a Postgres trigger (`incidents_notify`) calls `pg_notify('incidents', …)` on every insert or update. One `LISTEN` connection per server process (`src/lib/realtime.ts`) fans events out to every open **Server-Sent Events** stream at `GET /api/incidents/stream`, filtered to what the viewer may see.
- **Providers behind interfaces** chosen by environment variable: `SmsProvider` (console default, Semaphore, Twilio), `PushProvider` (console default, FCM HTTP v1), `StorageProvider` (local disk; an S3/R2/Azure Blob implementation can replace it).
- **NavoBot** lives in Microsoft 365 (Copilot Studio + SharePoint + Power Automate); NavoPulse only exposes a signed webhook and a Direct Line token endpoint.
- The **Expo native app is not built in this iteration**. It appears in the diagram as a future client of the same API; the PWA covers every citizen feature.

## 2. System context and containers

```mermaid
flowchart LR
  subgraph Citizens
    PWA["Citizen PWA<br/>/app<br/>(offline queue, EXIF, SMS composer)"]
    EXPO["Expo mobile app<br/>(future, not built)"]
    PHONE["Feature phone / no data<br/>SMS"]
  end

  subgraph LGU["Navotas City Government"]
    DASH["Command Dashboard<br/>/dashboard<br/>Leaflet map, SSE alerts"]
    RESP["Field responder<br/>(mobile dashboard view)"]
  end

  subgraph App["NavoPulse server (Next.js 16, Node 22, Docker)"]
    API["REST API /api<br/>zod validation, RBAC, rate limits"]
    SSE["SSE /api/incidents/stream"]
    NOTIF["Notification engine<br/>src/lib/notifications.ts"]
    WH["Webhooks<br/>/api/integrations/navobot/tickets<br/>/api/integrations/sms/inbound"]
    TOK["/api/navobot/token<br/>Direct Line token broker"]
    DEMO["/api/navobot/demo-chat<br/>(fallback bot)"]
  end

  subgraph Data
    PG[("PostgreSQL 16 + PostGIS<br/>LISTEN/NOTIFY")]
    FS[("StorageProvider<br/>local disk (S3/Blob later)")]
  end

  subgraph M365["Microsoft 365 tenant"]
    CS["Copilot Studio<br/>NavoBot agent"]
    SP[("SharePoint Online<br/>NavoBot KB")]
    PA["Power Automate<br/>'Create NavoPulse ticket' flow"]
  end

  FCM["Firebase Cloud Messaging<br/>(Android, web, iOS via APNs)"]
  SMS["SMS gateway<br/>Semaphore / Twilio"]

  PWA -- HTTPS JSON --> API
  EXPO -. HTTPS JSON .-> API
  DASH -- HTTPS JSON --> API
  RESP -- HTTPS JSON --> API
  DASH -- EventSource --> SSE
  PWA -- "Web Chat (Direct Line)" --> CS
  PWA -- token --> TOK
  TOK -- token request --> CS
  PWA -. demo mode .-> DEMO

  CS -- grounded answers --> SP
  CS -- Report an issue topic --> PA
  PA -- "POST + X-Api-Key or HMAC" --> WH

  PHONE -- "NVP1 SOS ..." --> SMS
  SMS -- inbound webhook --> WH
  NOTIF -- outbound SMS --> SMS
  NOTIF -- push --> FCM
  FCM --> PWA

  API --> PG
  WH --> PG
  NOTIF --> PG
  PG -- NOTIFY incidents --> SSE
  API -- photos --> FS
```

## 3. Code layout

```
navopulse/
├─ apps/web/                     Next.js app: dashboard, PWA, API
│  ├─ db/migrations/001_init.sql Schema, indexes, triggers
│  ├─ scripts/                   migrate.ts, seed.ts, seed-data.ts
│  └─ src/
│     ├─ app/api/**/route.ts     Route handlers (see 06-api.md)
│     ├─ app/dashboard/          LGU dashboard pages
│     ├─ app/app/                Citizen PWA pages (sos, report, reports, chat, …)
│     ├─ components/             UI (IncidentMap, Shell…)
│     ├─ proxy.ts                Redirects /dashboard/* to login without a session cookie
│     └─ lib/
│        ├─ auth.ts  rbac.ts     Sessions, permission matrix, office scope
│        ├─ incidents.ts         Create, scope, workflow, masking
│        ├─ notifications.ts     In-app / push / SMS fan-out
│        ├─ navobot.ts           Webhook auth, category mapping
│        ├─ crypto.ts            AES-256-GCM, lookup hashes, masking
│        ├─ realtime.ts          LISTEN/NOTIFY → SSE
│        ├─ analytics.ts         Summary and export queries
│        └─ providers/           sms.ts, push.ts, storage.ts
├─ packages/shared/src/          constants, zod schemas, controlNumber, smsPayload, i18n
├─ tests/load/incidents.k6.js    Load test
├─ tools/iso25010/compute.py     Survey statistics
└─ docs/                         This documentation set
```

## 4. Request pipeline

Every API route is wrapped by `route()` in `src/lib/http.ts`:

1. `requireUser(req, permission)` resolves the session (cookie `np_session` or `Authorization: Bearer`), checks the session row is not revoked or expired, and checks the permission against `PERMISSIONS` in `rbac.ts`. 401 if not signed in, 403 if not allowed.
2. `rateLimit(key, limit, window)` where applicable (in-memory fixed window; one instance).
3. `parseBody(req, zodSchema)`; zod errors become `400 {error:"Validation failed", details:[{path,message}]}`.
4. Business logic in `src/lib/*`, with **office scoping** (`scopeSql`) on every incident query.
5. `audit()` for administrative actions and PII access.
6. Errors: `ApiError` → its status; anything else → `500 {error:"Internal server error"}` with the stack only in server logs.

## 5. Sequence diagrams

### 5.1 App SOS (online)

```mermaid
sequenceDiagram
  autonumber
  actor C as Citizen
  participant P as PWA (/app)
  participant A as API POST /api/incidents
  participant DB as PostgreSQL/PostGIS
  participant L as realtime.ts (LISTEN)
  participant D as Dashboard (SSE)

  C->>P: Tap SOS, choose Flood
  P->>P: Get GPS + accuracy, generate clientId (UUID)
  opt Photo attached
    P->>P: Read EXIF, compress
    P->>A: POST /api/media (multipart, type=report)
    A-->>P: 201 {media.id}
  end
  P->>A: POST /api/incidents {clientId, categoryCode:EMR_FLOOD, location, peopleAffected, mediaIds}
  A->>A: requireUser(citizen.self), rateLimit 20/10 min, zod, Navotas bounds check
  A->>DB: SELECT by client_id (idempotency)
  A->>DB: BEGIN, upsert control_sequences (EMR, Manila date)
  A->>DB: INSERT incidents (trigger fills barangay_id via ST_Contains)
  A->>DB: INSERT incident_status_history (submitted), link media, COMMIT
  DB-->>L: NOTIFY incidents {op:INSERT, id, module, status, priority, controlNumber}
  L-->>D: event: incident (if inside viewer's office scope)
  D->>D: Audible + visual SOS alert, pin appears
  A-->>P: 201 {id, controlNumber:"NVP-EMR-20261019-000123", status:"submitted", created:true}
  P-->>C: Confirmation with control number
  Note over P,A: A retry with the same clientId returns 200 and the same controlNumber
```

### 5.2 Offline SMS SOS

```mermaid
sequenceDiagram
  autonumber
  actor C as Citizen
  participant P as PWA
  participant G as SMS provider (Semaphore/Twilio)
  participant W as POST /api/integrations/sms/inbound
  participant DB as PostgreSQL
  participant D as Dashboard

  C->>P: Tap SOS (no data connection)
  P->>P: POST fails, queue report (same clientId)
  P-->>C: "No connection. Send via SMS instead?"
  C->>P: Send via SMS
  P->>C: Open SMS composer to gateway number (from /api/public/config)<br/>"NVP1 SOS FLD 14.66712,120.94231 P3 R7f3a…1a0b N:Stranded sa bubong"
  C->>G: Send SMS (cellular)
  G->>W: POST {from, body, messageId} + X-Webhook-Secret (or ?secret=)
  W->>W: safeEqual(secret), normalise number, rateLimit 10/10 min per sender
  W->>DB: Duplicate check (provider, provider_message_id)
  W->>DB: INSERT sms_messages (inbound, number encrypted)
  W->>W: parseSosSms(body) → type, lat/lng, people, clientRef
  W->>DB: createIncident(source=sms, clientId=clientRef, reporter_mobile_enc)
  DB-->>D: NOTIFY → SSE → SOS alert
  W->>DB: UPDATE sms_messages SET parsed_incident_id, status=parsed
  W->>G: Outbound SMS "SOS received. Control no. NVP-EMR-… call 911 if worse"
  G-->>C: Acknowledgement SMS
  W-->>G: 200 {ok, created, incidentId, controlNumber}
  Note over P,DB: When data returns, the queued POST with the same clientId<br/>returns the SMS-created record (no duplicate)
```

### 5.3 NavoBot ticket

```mermaid
sequenceDiagram
  autonumber
  actor C as Citizen
  participant WC as Web Chat (in PWA)
  participant CS as Copilot Studio (NavoBot)
  participant SP as SharePoint KB
  participant PA as Power Automate flow
  participant W as POST /api/integrations/navobot/tickets
  participant DB as PostgreSQL

  WC->>W: (earlier) GET /api/navobot/token → Direct Line token
  C->>CS: "May tambak ng basura sa kanal dito sa San Jose"
  CS->>SP: (general questions are answered from the KB)
  CS->>CS: Report an issue topic: ask category, description, location/barangay, name/mobile (optional), confirm
  CS->>PA: Run flow (Category, Description, Lat, Lng, Barangay, Name, Mobile, ConversationId, Language)
  PA->>W: POST JSON + X-Api-Key (or X-NavoPulse-Timestamp/Signature)
  W->>W: rateLimit 120/min/IP, verifyNavobotRequest, zod
  W->>W: mapNavobotCategory("basura") → CIV_WASTE
  W->>DB: Find barangay by name → centroid when no GPS
  alt no GPS and no barangay
    W-->>PA: 422 {error, details:{reply_en, reply_fil}}
    PA-->>CS: reply asking for location
  else location known
    W->>DB: INSERT inquiries (NVP-INQ-…, status converted)
    W->>DB: createIncident(source=navobot, deterministic clientId)
    W->>DB: Link to citizen account if mobile matches
    W-->>PA: 201 {controlNumber, inquiryControlNumber, trackUrl, reply_en, reply_fil}
    PA-->>CS: Return reply_fil / reply_en / controlNumber
  end
  CS-->>C: "Naipadala na ang iyong ulat… NVP-CIV-20261019-000045"
```

### 5.4 Dispatch → resolve → notify → rate

```mermaid
sequenceDiagram
  autonumber
  actor Dp as DRRMO dispatcher
  actor R as Field responder
  actor C as Citizen
  participant API as API
  participant DB as PostgreSQL
  participant N as notifications.ts
  participant F as FCM
  participant S as SMS provider

  Dp->>API: POST /api/incidents/{id}/status {status:verified}
  API->>DB: UPDATE status, verified_at, INSERT history, audit
  API->>N: notifyIncidentStatus(verified)
  Dp->>API: POST /api/incidents/{id}/assign {unitId}
  API->>DB: status=assigned, assigned_unit_id, unit is_available=false, audit
  API->>N: notifyIncidentStatus(assigned, unit name)
  N->>DB: INSERT notifications (in_app)
  N->>F: push to reporter's device tokens
  alt no token or push failed
    N->>S: SMS to reporter's (decrypted) mobile
  end
  R->>API: GET /api/incidents (scope: assigned_unit_id = my unit)
  R->>API: POST /api/incidents/{id}/status {status:in_progress}
  R->>API: POST /api/media (type=resolution photo)
  R->>API: POST /api/incidents/{id}/resolve {note, mediaIds}
  API->>DB: status=resolved, resolved_at, resolution_note, link photo, free unit if idle, audit
  API->>N: notifyIncidentStatus(resolved) kind=feedback_request
  N->>F: "Status: Nalutas. I-rate ang aming serbisyo…"
  F-->>C: Push notification
  C->>API: GET /api/me/incidents/{id} (history + resolution photo)
  C->>API: POST /api/me/incidents/{id}/feedback {rating:5, comment}
  API->>DB: UPSERT feedback
  Note over DB: Analytics: response = created→verified/assigned, resolution = created→resolved, satisfaction = avg(rating)
```

## 6. Deployment view

```mermaid
flowchart TB
  Internet((Internet)) --> RP["Reverse proxy / TLS<br/>(Caddy, Nginx or cloud LB)<br/>must overwrite X-Forwarded-For"]
  RP --> WEB1["navopulse-web container<br/>next start (standalone)"]
  WEB1 --> DBC[("postgis/postgis:16 container<br/>volume: pgdata")]
  WEB1 --> VOL[("volume: storage/<br/>photos")]
  BK["Backup job<br/>pg_dump nightly + storage sync"] --> DBC
  BK --> OFF[("Off-site backup<br/>bucket / NAS")]
```

Scaling notes: rate limiting is in process memory and the SSE fan-out uses one LISTEN connection per process. Both work with several replicas (each replica listens on its own), but rate limits become per-replica; move them to Redis before scaling horizontally. Local-disk storage must move to an object store or a shared volume before running more than one replica.

## 7. Environments

| Environment | Purpose | Providers |
|---|---|---|
| Local dev | `pnpm dev`, dev secrets default, OTP shown on screen | console SMS/push |
| Staging | Shared integration with Copilot Studio test agent, FCM test project, provider sandbox | `SMS_PROVIDER=semaphore` or `twilio` (test numbers), `PUSH_PROVIDER=fcm` |
| Production | Live city use | Real providers; `NODE_ENV=production` refuses to start without secrets; OTP never exposed unless `NAVOPULSE_DEMO_OTP=1` |
