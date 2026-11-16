# NavoPulse Software Requirements Specification (SRS)

| | |
|---|---|
| Project | NavoPulse: Integrated Smart City Civic Engagement, Disaster Response and AI Public Assistance Platform for Navotas City |
| Program | Master in Information Technology (System Administration), Our Lady of Fatima University, Valenzuela |
| Document | SRS outline, structure loosely based on IEEE 830 / ISO/IEC/IEEE 29148 |
| Source of truth | `NavoPulse_Development_Prompt.md` (Master Prompt + phase prompts) |
| Status of build | Iteration 1. Each requirement has a **Status** column: **Built** (implemented in `apps/web`), **Partial**, or **Not built**. |

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements of NavoPulse. It is used by the developer, adviser and panel to check scope, by testers to derive test cases (see `08-testing-plan.md`), and by the ISO/IEC 25010 evaluation (see `09-iso25010-evaluation.md`).

### 1.2 Scope
NavoPulse is one platform made of four parts that share one backend and one database:

1. **NavoBot**: an AI public assistant built in Microsoft Copilot Studio and grounded on a SharePoint Online knowledge base. It answers in Tagalog, English and Taglish, and creates tickets through Power Automate calling the NavoPulse webhook.
2. **Citizen app**: an installable Progressive Web App (PWA) served at `/app`. A native Expo (React Native) app is in the spec but **is not built in this iteration**; the PWA covers the citizen features.
3. **LGU Web Command Dashboard** at `/dashboard` for DRRMO, TMO, PIO and administrators.
4. **Backend API and notification engine** at `/api`: REST endpoints, PostgreSQL 16 + PostGIS, realtime feed, push (FCM), SMS (Semaphore/Twilio) and analytics.

Out of scope for iteration 1: native mobile app, payment of fees, permit application processing, CCTV integration, and automatic dispatch without a human dispatcher.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Incident | Any report: emergency (SOS), civic concern, or traffic/DisipliNavo report |
| Module | `emergency`, `civic`, or `traffic`; decides the control-number prefix (EMR, CIV, TRF) |
| Inquiry | A NavoBot conversation recorded for follow-up; control prefix INQ |
| Control number | `NVP-{EMR\|CIV\|TRF\|INQ}-{YYYYMMDD}-{6-digit sequence}`, date in Asia/Manila, e.g. `NVP-EMR-20261019-000123` |
| Source | Channel an incident came from: `app`, `sms`, `navobot`, `walk_in` |
| Office | Owning office of a category: DRRMO, TMO or PIO |
| PII | Personal information under RA 10173 (name, mobile number) |
| SSE | Server-Sent Events, the realtime transport used by the dashboard |

### 1.4 References
- ISO/IEC 25010:2011 Systems and software Quality Requirements and Evaluation (SQuaRE): system and software quality models. (A 2023 revision exists with nine characteristics; this project is evaluated against the eight-characteristic 2011 model named in the spec.)
- Republic Act No. 10173, Data Privacy Act of 2012, and its IRR; NPC circulars.
- OWASP Top 10 (2021).

---

## 2. Overall description

### 2.1 Product perspective
A single Next.js 16 application (`apps/web`) serves the dashboard, the PWA and the API. Shared types, zod schemas, the control-number formatter and the SMS payload codec live in `packages/shared`. External services sit behind interfaces so they can be swapped: `SmsProvider` (console, Semaphore, Twilio), `PushProvider` (console, FCM HTTP v1), `StorageProvider` (local disk). See `02-architecture.md`.

### 2.2 User classes and roles

| Role (code) | Who | Main capabilities (from `src/lib/rbac.ts`) |
|---|---|---|
| `citizen` | Navotas residents (PWA) | Submit and track own reports, chat with NavoBot, view content, rate resolved cases |
| Guest (no account) | Any visitor | View advisories, directory, transit, Angat Navotas content, chat with NavoBot |
| `drrmo_dispatcher` | City DRRMO operations center | View/manage incidents of DRRMO categories, assign units, manage units, reveal reporter contact, send broadcasts, analytics, notification and SMS logs |
| `tmo_officer` | Traffic Management Office | View/manage incidents of TMO categories (traffic, DisipliNavo, most civic), manage TMO units, reveal reporter contact, analytics |
| `field_responder` | Rescue teams, enforcers, crews | See only incidents assigned to their unit, start/resolve with resolution photo, update own unit's availability/location, reveal reporter contact (logged) |
| `pio_admin` | Public Information Office | Manage content (announcements, events, businesses, transit, barangay directory), see PIO-category and NavoBot-sourced tickets, broadcasts, analytics, notification log |
| `super_admin` | System administrator | All of the above plus user management and audit log |

Office scoping: a dispatcher, TMO officer or PIO admin only sees incidents whose category's `default_office` is their office (PIO additionally sees every `source = navobot` ticket). A responder only sees incidents assigned to their unit. The super admin sees everything.

### 2.3 Operating environment
- Server: Linux container, Node.js 22, PostgreSQL 16 with PostGIS 3.
- Clients: latest Chrome, Edge, Firefox, Safari; Android 9+ and iOS 15+ browsers for the PWA.
- External: Microsoft 365 tenant (Copilot Studio, SharePoint Online, Power Automate), Firebase project (FCM), Philippine SMS provider account.

### 2.4 Design and implementation constraints
- TypeScript everywhere; zod validation at every API boundary.
- **Raw SQL migrations instead of an ORM** (the spec suggests Prisma/Drizzle). Decision: most important queries are PostGIS (`ST_Contains`, `ST_DWithin`, `ST_VoronoiPolygons`, `ST_AsGeoJSON`), which ORMs express poorly. Migrations live in `apps/web/db/migrations/*.sql`, applied by `scripts/migrate.ts`.
- Realtime via Postgres `LISTEN/NOTIFY` and SSE instead of WebSockets (one-way server-to-browser updates are all the dashboard needs, and SSE passes through ordinary HTTP proxies).
- Seed barangay boundaries are generated Voronoi approximations, and hotlines and officials are placeholders. Official PSA/NAMRIA boundaries and city-confirmed numbers must be loaded before any public use.

### 2.5 Assumptions and dependencies
- The city provides an SMS gateway number that can forward inbound messages to a webhook.
- The PIO owns and maintains the SharePoint knowledge base.
- 911 is the national emergency number; local DRRMO/PNP/BFP numbers are configured through `NEXT_PUBLIC_HOTLINE_*` once the city confirms them.

---

## 3. Functional requirements

Priority: **M** = must, **S** = should, **C** = could.

### 3.1 Authentication and accounts (AUTH)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-01 | Citizens sign in with a PH mobile number and a 6-digit OTP sent by SMS, valid 5 minutes, max 5 wrong attempts per code. | M | Built (`/api/auth/otp/*`) |
| FR-02 | First-time citizens must accept the privacy notice before an account is created; consent time is stored (`users.privacy_consent_at`). | M | Built |
| FR-03 | Guests can view advisories and city information without signing in. | M | Built (`/api/public/*`) |
| FR-04 | Staff sign in with email and password (bcrypt); unknown emails take as long as wrong passwords. | M | Built (`/api/auth/login`) |
| FR-05 | Sessions are server-side records referenced by a signed JWT (cookie `np_session` or Bearer); staff 12 h, citizens 30 days; logout, disabling a user, role change or password change revokes sessions. | M | Built |
| FR-06 | Citizens may register with email instead of mobile. | C | Not built (schema allows it; no endpoint) |
| FR-07 | Refresh-token rotation. | S | Not built (long-lived revocable sessions are used instead) |

### 3.2 Emergency SOS (SOS)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-10 | One-tap SOS from the PWA home screen for flood, fire, medical or other. | M | Built (`src/app/app/sos/page.tsx`) |
| FR-11 | SOS captures GPS (with accuracy), optional photos (max 5), short description and people affected. | M | Built (`POST /api/incidents`, `POST /api/media`) |
| FR-12 | Reports outside the Navotas bounding box are rejected with HTTP 422 and a message to move the pin. | M | Built |
| FR-13 | The citizen sees a confirmation with the control number. | M | Built (response `controlNumber`) |
| FR-14 | Creation is idempotent on a client-generated UUID (`clientId`): retries return the original record (HTTP 200) instead of a duplicate. | M | Built |
| FR-15 | If submission fails, the report is queued on the device and retried automatically. | M | Built (`src/lib/offlineQueue.ts`) |
| FR-16 | Offline SMS fallback: the app composes `NVP1 SOS <FLD\|FIR\|MED\|OTH> <lat>,<lng> P<n> R<uuid-hex> N:<note>` (one 160-char segment) for the city gateway number from `/api/public/config`. | M | Built (`packages/shared/src/smsPayload.ts`, SOS page SMS link) |
| FR-17 | The inbound SMS webhook parses the payload, creates the same incident (`source = sms`), deduplicates on provider message ID and on the `R` reference, and replies with the control number by SMS. Unparseable `NVP…` messages get an SMS telling the sender to call 911. | M | Built (`/api/integrations/sms/inbound`) |

### 3.3 DisipliNavo Cam and community reporting (CIV/TRF)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-20 | Citizens report illegal parking, obstructions, blocked emergency routes, accidents, waste dumping, damaged infrastructure, clogged drainage, broken streetlights and other concerns (14 seeded categories). | M | Built |
| FR-21 | EXIF GPS and timestamp are extracted on the device (before compression strips them) and sent as `exifLat/exifLng/exifTakenAt`; the report uses `locationSource = exif` and `observedAt`. Without EXIF, device GPS is used. | M | Built (`src/lib/image.ts` uses exifr) |
| FR-22 | Uploads accept only real JPEG/PNG/WebP (magic-byte check), max 5 MB; images are compressed on the client. | M | Server checks built |
| FR-23 | Each report gets a tracking control number (CIV or TRF). | M | Built |

### 3.4 Report tracking and feedback (TRK)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-30 | "My reports" lists the citizen's reports with status (Submitted, Verified, Assigned, In Progress, Resolved, Rejected, Duplicate), in Filipino or English. | M | Built (`/api/me/incidents`) |
| FR-31 | Report detail shows status history and the resolution photo; internal notes are never shown to citizens. | M | Built |
| FR-32 | After resolution the citizen is prompted for a 1 to 5 star rating and optional comment; one rating per case, editable. | M | Built (`/api/me/incidents/{id}/feedback`) |
| FR-33 | Citizens have an in-app notification inbox with unread count. | S | Built (`/api/me/notifications`) |
| FR-34 | Rating of NavoBot inquiries. | C | Not built (table supports `inquiry_id`; no endpoint) |

### 3.5 NavoBot (BOT)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-40 | Answers 24/7 in Tagalog, English and Taglish about city services, permits, flood advisories, transit and barangay directory, grounded only on the SharePoint KB. | M | Configured in Copilot Studio (see `05-navobot-copilot-studio.md`) |
| FR-41 | Safety: says it does not know instead of guessing; always routes life-threatening emergencies to SOS, 911 and the DRRMO hotline; never invents flood or evacuation information. | M | Agent instructions + demo bot follows the same rules |
| FR-42 | "Report an issue" topic collects category, description, location (GPS or barangay) and optional name/mobile and calls Power Automate, which POSTs to `/api/integrations/navobot/tickets`. | M | Webhook built |
| FR-43 | The webhook authenticates with `X-Api-Key` or an HMAC-SHA256 signature with a 5-minute replay window. | M | Built (`src/lib/navobot.ts`) |
| FR-44 | The webhook maps free-text Taglish categories to category codes, uses the barangay centroid when no GPS is given, returns 422 with `reply_en`/`reply_fil` when neither is given, records an INQ inquiry, creates the incident (`source = navobot`) and returns `controlNumber`, `reply_en`, `reply_fil`, `trackUrl`. Retries of the same ticket are idempotent. | M | Built |
| FR-45 | Web Chat is embedded in the PWA using a short-lived Direct Line token from `/api/navobot/token`; the Direct Line secret never reaches the browser. | M | Built |
| FR-46 | When Copilot Studio is not configured, a rule-based demo bot (`/api/navobot/demo-chat`) answers from the database with the same safety rules. | S | Built |

### 3.6 City information (INFO)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-50 | Transport Hub: routes, terminals/stops, fares, route guides, route lines on a map. | M | Built (`/api/public/transit`) |
| FR-51 | Barangay Directory: all 18 barangays with officials, hotline, address, map location and boundary. | M | Built; data are placeholders until PIO updates them |
| FR-52 | Angat Navotas: announcements, upcoming events and local business listings. | M | Built (`/api/public/content`) |
| FR-53 | Advisories feed of active flood/weather alerts, filtered to city-wide plus the citizen's barangay. | M | Built (`/api/public/advisories`) |
| FR-54 | Filipino/English language toggle; Filipino is the default. | M | Strings built (`packages/shared/src/i18n.ts`) |

### 3.7 Command dashboard: map and tickets (DASH)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-60 | Role-based login; navigation shows only items the role has permission for. | M | Built (`Shell.tsx`, `/api/auth/me` returns permissions) |
| FR-61 | Live Leaflet/OpenStreetMap map with pins colored by category, clustering, heatmap, barangay boundary overlay and unit locations; handles at least 5,000 pins. | M | Built (`IncidentMap.tsx`) |
| FR-62 | Filters by module, status, source, priority, barangay, category, date range (Manila days) and text search. | M | Built (`GET /api/incidents`) |
| FR-63 | New and changed incidents arrive in realtime (SSE) filtered to the viewer's scope, with an audible/visual alert for new SOS. | M | Built (`useIncidentFeed.ts` beeps and shows an alert on new emergency incidents) |
| FR-64 | Incident detail: photos, location, accuracy and location source, reporter info masked for roles that do not need it, timeline, internal notes, possible duplicates (same category, open, within 150 m and 24 h). | M | Built |
| FR-65 | Status changes follow the allowed transition table; terminal statuses (resolved, rejected, duplicate) cannot be reopened. | M | Built (`STATUS_TRANSITIONS`) |
| FR-66 | Duplicate merging marks a case `duplicate`, links it to the original and adds a note on the original. | M | Built |
| FR-67 | Revealing a masked reporter is an explicit action that is always audit-logged. | M | Built |
| FR-68 | Staff can log walk-in/phone reports (`source = walk_in`). | S | Built |

### 3.8 Field crews and resolution (UNIT)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-70 | Manage response units (name, office, type, contact, availability, location). | M | Built (`/api/units`) |
| FR-71 | Assign an incident to a unit; the unit becomes unavailable; the reporter is notified. | M | Built |
| FR-72 | Route guidance via a "Navigate" link to Google Maps/OSM directions to the incident point. | M | Built (`IncidentDetail.tsx`) |
| FR-73 | Responders see only their unit's incidents on a mobile-friendly view, set In Progress, and resolve with note and photo(s). | M | API built |
| FR-74 | Resolving frees the unit when it has no other active cases and notifies the citizen with a rating request. | M | Built |

### 3.9 Broadcast alerts and notifications (ALRT)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-80 | DRRMO and PIO send bilingual advisories (info, advisory, warning, critical) to everyone or selected barangays via push and/or SMS. Advisories expire after 2 days. | M | Built (`POST /api/advisories`) |
| FR-81 | Critical advisories fall back to SMS for citizens without a working push token. | S | Built |
| FR-82 | Status-change notifications: in-app always, push if a device is registered, SMS if push is unavailable or fails (covers SMS and NavoBot reporters without accounts). | M | Built (`notifyIncidentStatus`) |
| FR-83 | Every delivery attempt is logged (notification log); every SMS in and out is logged with masked number; OTP bodies are redacted in the log view. | M | Built |
| FR-84 | Delivery receipts (`delivered` status) from FCM/SMS providers. | C | Not built |

### 3.10 Content management (CMS)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-90 | PIO manages announcements, events, businesses, transit routes and barangay directory entries (hotline, address, population, officials). | M | Built (`/api/admin/content/{type}`) |
| FR-91 | Editing transit stops and route geometry. | S | Not built (seeded only) |

### 3.11 Analytics and reporting (ANL)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-100 | Counts by status, category/type, barangay, source; daily trend; NavoBot ticket volume and inquiry conversion; average and median response time (report to verify/assign) and average resolution time; satisfaction average and distribution. Scoped to the viewer's office. | M | Built (`/api/analytics/summary`) |
| FR-101 | Export to CSV and Excel without personal data. | M | Built (`/api/analytics/export`) |
| FR-102 | Export to PDF. | M | Partial: the analytics page has a PDF button that opens the browser print dialog (print stylesheet); no server-generated PDF |

### 3.12 Administration and audit (ADM)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-110 | Super admin creates staff accounts, changes roles, links responders to units, resets passwords and disables accounts (cannot demote/disable self; cannot convert citizen and staff). | M | Built (`/api/admin/users`) |
| FR-111 | Audit log of every administrative action, sign-in, failed sign-in and PII view/reveal, with before/after, IP and user agent; viewable by super admin with action-prefix filter. | M | Built (`/api/audit`) |
| FR-112 | Super admin manages incident categories. | M | **Not built** (seeded; no API) |
| FR-113 | Super admin manages system settings. | S | **Not built** (`settings` table and `settings.manage` permission exist, no API) |
| FR-114 | Staff view NavoBot inquiries and the incidents they became. | S | Built (`/api/inquiries`); changing inquiry status not built |

---

## 4. Non-functional requirements (mapped to ISO/IEC 25010)

| ID | ISO/IEC 25010 characteristic / sub-characteristic | Requirement | How it is met / verified |
|---|---|---|---|
| NFR-01 | Functional suitability / completeness, correctness | Every M requirement in section 3 works end to end (app, SMS and NavoBot sources to rating). | E2E test, UAT checklist (`08-testing-plan.md`) |
| NFR-02 | Performance efficiency / time behaviour | API p95 < 500 ms for incident list (5,000 rows) and analytics summary under expected load. | k6 `tests/load/incidents.k6.js` thresholds |
| NFR-03 | Performance efficiency / capacity | Map renders ≥ 5,000 pins with clustering (canvas markers, chunked loading). | `SEED_INCIDENTS=5000 pnpm db:seed` then a browser profiling test |
| NFR-04 | Performance efficiency / resource utilization | Photos compressed on the client before upload; server limit 5 MB. | Upload tests |
| NFR-05 | Compatibility / co-existence, interoperability | Works on Android 9+, iOS 15+ browsers and current desktop browsers; integrates with Copilot Studio, FCM, Semaphore/Twilio through documented interfaces; CSV/XLSX exports open in Excel/LibreOffice. | Compatibility matrix tests |
| NFR-06 | Usability / operability, accessibility | Large touch targets; SOS reachable in one tap from home; Filipino and English text; color is never the only status cue. | UAT, questionnaire |
| NFR-07 | Usability / user error protection | Clear validation messages in plain language; outside-city pin rejected with guidance; confirmations for destructive actions. | UAT |
| NFR-08 | Reliability / fault tolerance | Offline queue with retry; SMS fallback; idempotent creation (`clientId`, SMS `R` reference, deterministic NavoBot client ID, unique provider message ID). | Integration tests |
| NFR-09 | Reliability / recoverability, availability | Daily database backups with tested restore; `/api/health` for monitoring; realtime listener reconnects. | Runbook drills (`12-runbook.md`) |
| NFR-10 | Security / confidentiality | HTTPS only (HSTS in production); PII encrypted at rest (AES-256-GCM); masking by role; RBAC on every endpoint and office scoping. | OWASP review (`07-security-privacy.md`) |
| NFR-11 | Security / integrity, authenticity | zod validation; signed/keyed webhooks; bcrypt passwords; OTP hashed; parameterised SQL. | Security tests |
| NFR-12 | Security / accountability, non-repudiation | Append-only audit log of admin actions and PII access. | Audit log review |
| NFR-13 | Security / resistance | Rate limits on login, OTP, incident creation, uploads, broadcasts, webhooks. | Load/abuse tests |
| NFR-14 | Maintainability / modularity, reusability | Monorepo with `packages/shared`; providers behind interfaces; one permission matrix. | Code review |
| NFR-15 | Maintainability / testability, analysability | Vitest unit and integration tests; lint and type-check in CI; structured logs prefixed `[api]`, `[notify]`, `[realtime]`, `[sms:console]`, `[push:console]`. | CI |
| NFR-16 | Portability / installability, adaptability | Docker images; all configuration through environment variables; PWA installable; responsive from 360 px. | Deployment test |
| NFR-17 | Privacy (RA 10173) | Consent at registration, data minimisation, masking, encryption, retention periods, access logs. | RA 10173 checklist |
| NFR-18 | AI safety | NavoBot answers only from the KB; admits not knowing; routes emergencies to SOS/911/DRRMO; never invents flood/evacuation info. | NavoBot test script (≥ 20 cases) |

---

## 5. Use cases

Each use case lists the actor, precondition, main flow and alternative flows (A1, A2…).

### UC-01 Register / sign in with OTP (Citizen)
- **Precondition:** PWA open; citizen has a PH mobile number.
- **Main flow:** 1) Citizen enters mobile number and taps Send code. 2) System sends a 6-digit code by SMS (shown on screen in dev/demo). 3) Citizen enters the code. 4) First-time: system asks for name, barangay, language and privacy consent. 5) System creates the account, starts a session and opens Home.
- **Alternatives:** A1 Wrong code: "Incorrect code"; after 5 attempts the code is dead. A2 Expired: "Code expired. Request a new one." A3 More than 3 requests per number in 15 min: HTTP 429 with retry time. A4 Consent not ticked: registration refused with `needsRegistration`. A5 Number belongs to a staff account: told to use email sign-in.

### UC-02 Send an SOS (Citizen)
- **Precondition:** Signed in; location permission granted or pin placed.
- **Main flow:** 1) Citizen taps SOS on Home. 2) Picks Flood/Fire/Medical/Other. 3) App gets GPS, citizen optionally adds photo, description, people affected. 4) App generates `clientId` and POSTs. 5) System assigns an EMR control number, stores the incident, fills the barangay from the point, and broadcasts it to the dashboard. 6) App shows the control number.
- **Alternatives:** A1 No connection: report is queued and retried; app offers "Send via SMS instead" (UC-03). A2 Pin outside Navotas: HTTP 422, citizen moves the pin. A3 Retry after timeout: same `clientId` returns the same control number (HTTP 200). A4 Life-threatening and no data/SMS: app offers "Call 911".

### UC-03 Offline SMS SOS (Citizen, SMS gateway)
- **Precondition:** SOS submission failed; phone has cellular signal.
- **Main flow:** 1) App composes the NVP1 payload with the report's `clientId` and opens the SMS composer to the gateway number. 2) Citizen sends. 3) Provider forwards to `/api/integrations/sms/inbound`. 4) System logs the SMS, parses it, creates the incident (`source = sms`), links a registered citizen by number, and replies with the control number.
- **Alternatives:** A1 Provider retries the webhook: same message ID returns `duplicate: true`. A2 App later syncs the queued report: same `clientId` returns the SMS-created record. A3 Message starts with NVP but cannot be parsed: logged with `parse_error`, reply tells the sender to call 911. A4 Wrong webhook secret: 401.

### UC-04 Report a civic or traffic concern with DisipliNavo Cam (Citizen)
- **Precondition:** Signed in.
- **Main flow:** 1) Citizen opens Report a concern, picks a category. 2) Takes or picks a photo; app reads EXIF GPS/time, compresses, uploads (`POST /api/media`). 3) Location defaults to the photo location, else device GPS; citizen may move the pin. 4) Submits; gets a CIV/TRF control number.
- **Alternatives:** A1 Photo has no EXIF: device GPS used, `locationSource = device`. A2 File not an image or > 5 MB: 415/413 message. A3 More than 30 uploads or 20 reports in 10 min: 429.

### UC-05 Track a report and rate the service (Citizen)
- **Precondition:** Citizen has at least one report.
- **Main flow:** 1) Opens My reports. 2) Selects a report; sees status history and resolution photo. 3) On resolution receives in-app/push/SMS notice. 4) Rates 1 to 5 and comments.
- **Alternatives:** A1 Not yet resolved: rating refused (409). A2 Merged as duplicate: shows "Tracked under NVP-…". A3 Rates again: previous rating is replaced.

### UC-06 Ask NavoBot (Citizen or Guest)
- **Precondition:** PWA open.
- **Main flow:** 1) Opens Ask NavoBot; PWA fetches a Direct Line token and starts Web Chat. 2) Asks in Tagalog/English/Taglish. 3) NavoBot answers from the SharePoint KB with a source citation.
- **Alternatives:** A1 Not in KB: says it does not know and suggests the office to contact. A2 Emergency words: tells the user to press SOS / call 911 / DRRMO hotline. A3 Copilot Studio not configured: token endpoint returns 404 and the PWA uses the demo bot.

### UC-07 Report an issue through NavoBot (Citizen, Copilot Studio, Power Automate)
- **Precondition:** In NavoBot chat.
- **Main flow:** 1) Citizen says e.g. "may tambak ng basura sa San Jose". 2) Topic collects category, description, location or barangay, optional name/number, confirms. 3) Power Automate POSTs to the webhook with `X-Api-Key`. 4) System creates INQ inquiry and incident (`source = navobot`), returns `reply_fil`/`reply_en` with the control number. 5) Bot reads the reply back.
- **Alternatives:** A1 No location and no barangay: 422 with `reply_*` asking for location; topic re-asks. A2 Flow retries: same conversation/category/description returns the same control number (HTTP 200). A3 Bad credentials: 401; bot apologises and suggests the app. A4 Emergency described: bot first shows SOS/911 guidance, then may file the ticket.

### UC-08 Monitor the live map (Dispatcher, TMO officer, PIO admin)
- **Precondition:** Signed in to `/dashboard`.
- **Main flow:** 1) Map loads open incidents in scope with clustering, heatmap and boundaries. 2) SSE stream delivers new/changed incidents; new SOS triggers an audible and visual alert. 3) User filters by type, status, barangay, date, source.
- **Alternatives:** A1 Stream drops: browser EventSource reconnects automatically. A2 Incident outside scope: not delivered on the stream.

### UC-09 Verify, merge or reject (Dispatcher / TMO officer)
- **Precondition:** Incident `submitted` in the user's scope.
- **Main flow:** 1) Opens detail, reviews photos, location and possible duplicates. 2) Sets Verified (optionally with note). 3) Reporter is notified.
- **Alternatives:** A1 Duplicate: merges into the original; reporter told "Tracked under …". A2 Invalid/prank: Rejected with note. A3 Needs to call reporter: Reveal contact (logged) if role sees masked data.

### UC-10 Assign a unit (Dispatcher / TMO officer)
- **Precondition:** Incident submitted, verified, assigned or in progress.
- **Main flow:** 1) Picks an available unit of the office. 2) System sets `assigned`, records the unit, marks it unavailable, notifies the reporter. 3) Dispatcher shares the Navigate link.
- **Alternatives:** A1 Reassign while in progress: status stays `in_progress`. A2 Incident terminal: 409.

### UC-11 Respond and resolve (Field responder)
- **Precondition:** Responder account linked to a unit; incident assigned to that unit.
- **Main flow:** 1) Opens My assignments on a phone. 2) Taps Start (In Progress). 3) On site, takes a resolution photo (uploaded as `type = resolution`), writes a note, taps Resolve. 4) System resolves, frees the unit if idle, notifies the citizen with a rating request.
- **Alternatives:** A1 Tries another status (e.g. reject): 403. A2 Incident of another unit: 404. A3 Needs to call the reporter: Reveal contact (logged).

### UC-12 Send a broadcast advisory (Dispatcher / PIO admin)
- **Precondition:** Holds `broadcast.send`.
- **Main flow:** 1) Writes title, English and Filipino body, severity. 2) Picks all barangays or a selection, channels push/SMS. 3) Sends; system fans out in-app, push, SMS and shows recipient count.
- **Alternatives:** A1 More than 10 broadcasts in 10 min: 429. A2 Critical with no push token: SMS fallback.

### UC-13 Manage content (PIO admin)
- **Main flow:** Create/edit/delete announcements, events, businesses, transit routes; edit barangay hotline, address, population and officials. Each change is audit-logged with before/after.
- **Alternatives:** A1 Barangays cannot be created or deleted (405). A2 Coordinates outside the Navotas area rejected.

### UC-14 View analytics and export (Dispatcher, TMO officer, PIO admin, Super admin)
- **Main flow:** Pick date range (default last 30 days); see charts; export CSV or XLSX. Export is audit-logged and contains no personal data.
- **Alternatives:** A1 PDF: the PDF button prints the page through the browser (Save as PDF).

### UC-15 Administer users and review audit log (Super admin)
- **Main flow:** Create staff, set role/unit, reset password, disable; review audit log filtered by action prefix (e.g. `pii.`).
- **Alternatives:** A1 Duplicate email: 409. A2 Attempt to disable self: 400.

---

## 6. Traceability

| Spec section | Requirements |
|---|---|
| 3 Citizen app | FR-01 to FR-54 |
| 3 Dashboard | FR-60 to FR-114 |
| 3 Roles | Section 2.2, `src/lib/rbac.ts` |
| 5 Data model | `03-data-model.md` |
| 6 Core workflow | UC-02, UC-07, UC-08 to UC-11, UC-05; sequence diagrams in `02-architecture.md` |
| 7 Non-functional | NFR-01 to NFR-18 |
