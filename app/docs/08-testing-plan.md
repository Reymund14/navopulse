# NavoPulse Test Plan

## 1. Strategy

| Level | Tool | What | Where | Run |
|---|---|---|---|---|
| Static | ESLint, `tsc --noEmit` | Lint and type safety for `apps/web` and `packages/shared` | `pnpm lint`, `pnpm typecheck` | Every commit (CI) |
| Unit | Vitest | Pure logic: control-number format and Manila date, SMS payload encode/parse, status transitions, PH mobile normaliser, zod schemas, i18n completeness, NavoBot category mapping and HMAC verification, masking | `packages/shared/test/*.test.ts`; `apps/web/test/**/*.test.ts` | Every commit |
| Integration | Vitest + real PostgreSQL/PostGIS (`TEST_DATABASE_URL`, default `postgres://navopulse:navopulse@localhost:5432/navopulse_test`) | Route handlers called with `Request` objects against a migrated test DB: RBAC and scope, idempotency, triggers, control-number concurrency, webhook auth | `apps/web/test/**` (`vitest.config.ts` runs files sequentially) | Every commit (CI with a PostGIS service) |
| End-to-end lifecycle | Vitest integration suite (API level) + manual browser run | App, SMS and NavoBot sources → verify → assign → in progress → resolve with photo → notification → rating | §3 | Before each release |
| Load | k6 | Map feed, analytics, citizen creation | `tests/load/incidents.k6.js` | Before UAT and after performance changes |
| GPS precision | Field test | Device GPS and EXIF accuracy vs surveyed points | §5 | Once per device class, Phase 5 |
| Low connectivity / SMS | Field + lab | Offline queue, SMS fallback, delivery timing | §6 | Phase 5 |
| Security | Manual + scripts | OWASP checks in `07-security-privacy.md` | §7 | Phase 5 |
| UAT | Checklist with LGU officers and residents | §8 | Phase 5 |
| Quality evaluation | ISO/IEC 25010 questionnaire | `09-iso25010-evaluation.md` | After UAT |

Status at time of writing: `packages/shared/test/shared.test.ts` covers control numbers, SMS payload, schemas and i18n. `apps/web/test/lifecycle.test.ts` (with `globalSetup.ts`, which resets and seeds the test DB with 60 incidents) covers the app-source lifecycle, illegal transitions, RBAC scoping and masking, duplicate merge, SMS SOS dedupe, NavoBot HMAC and category mapping, and barangay-targeted advisories. CI (`.github/workflows/ci.yml`) runs lint, type-check, tests against a PostGIS service, and build. Cases below not yet covered by those files are the backlog.

## 2. Unit and integration test cases

| ID | Area | Case | Expected |
|---|---|---|---|
| UT-01 | Control number | `formatControlNumber("EMR","20261019",123)` | `NVP-EMR-20261019-000123` |
| UT-02 | Control number | 2026-10-18T17:30Z | date key `20261019` (Manila) |
| UT-03 | Control number | sequence 0 or 1,000,000 | throws |
| UT-04 | SMS payload | encode with long note | ≤ 160 chars, parses back to same type/lat/lng/people/clientRef |
| UT-05 | SMS payload | `nvp1 sos fld 14.667,120.942` (hand-typed, lowercase, no P/R) | ok, peopleAffected 1, clientRef undefined |
| UT-06 | SMS payload | `NVP1 SOS XXX …`, missing coords, lat 95 | `ok:false` with specific error |
| UT-07 | Workflow | `canTransition` for every pair | matches `STATUS_TRANSITIONS`; no exit from terminal states |
| UT-08 | Mobile | `0917 123 4567`, `639171234567`, `+639171234567` | `+639171234567`; `0817…` rejected |
| UT-09 | NavoBot | `mapNavobotCategory("basura", …)`; `"CIV_WASTE"`; `"nakaparada sa emergency route"`; unknown | CIV_WASTE; CIV_WASTE; TRF_EMERGENCY_ROUTE (order matters: emergency route before parking); CIV_OTHER |
| UT-10 | NavoBot | `verifyNavobotRequest` valid HMAC; tampered body; timestamp 301 s old; API key match/mismatch | true; false; false; true/false |
| UT-11 | Crypto | `encrypt`/`decrypt` round trip; tampered tag | equal; throws |
| UT-12 | Masking | `maskMobile("+639170000001")`, `maskName("Juan Dela Cruz")` | `+63 917 *** 0001`, `J*** D*** C***` |
| UT-13 | i18n | every key has en and fil | no missing |
| IT-01 | Auth | login good/bad password, citizen email, disabled user | 200 + cookie / 401 / 401 / 401; audit rows |
| IT-02 | Auth | OTP request → verify new number without consent → with consent | 400 `needsRegistration` → 200 `isNew:true`, `privacy_consent_at` set |
| IT-03 | Auth | 6th wrong OTP attempt; 4th OTP request in 15 min | 401 expired; 429 |
| IT-04 | RBAC | every route × every role (matrix test driven by `PERMISSIONS`) | 401/403/200 as per matrix |
| IT-05 | Scope | TMO officer opens an EMR incident; PIO opens a navobot ticket; responder opens another unit's incident | 404; 200; 404 |
| IT-06 | Create | POST twice with the same `clientId` | 201 then 200, same `controlNumber`, one row |
| IT-07 | Create | 50 concurrent creates | 50 distinct sequential control numbers |
| IT-08 | Create | point outside Navotas | 422 |
| IT-09 | Trigger | point inside a barangay polygon; point on the bay < 1.5 km from a centroid; far point | barangay set; nearest barangay; NULL |
| IT-10 | Workflow | status → assigned/duplicate/resolved via status route | 400 with hint |
| IT-11 | Workflow | assign → unit `is_available=false`; resolve → unit available when no other active case | as described |
| IT-12 | Merge | merge into itself; into a duplicate | 400 |
| IT-13 | PII | dispatcher detail → `pii.view` audit; PIO detail → masked, `canReveal:false`; responder reveal → `pii.reveal` audit | as described |
| IT-14 | Media | upload a .txt renamed .jpg; 6 MB image; citizen uploads `type=resolution` | 415; 413; 403 |
| IT-15 | Media | another citizen GETs a photo | 404 |
| IT-16 | SMS inbound | wrong secret; valid payload; same `messageId` again; garbage starting with NVP | 401; incident created + ack SMS; `duplicate:true`; `ok:false` + 911 SMS |
| IT-17 | SMS + app | SMS with `R<clientId>` then app POST with same `clientId` | one incident |
| IT-18 | NavoBot | API key; HMAC; no location/barangay; retry | 201; 201; 422 with `reply_*`; 200 same number |
| IT-19 | Notify | status change for reporter with device token (stub push ok); with failing push; SMS-only reporter | in_app + push rows; in_app + push failed + SMS; SMS only |
| IT-20 | Feedback | rate before resolved; after; rate again | 409; 200; replaced |
| IT-21 | Advisory | barangay-targeted broadcast | only citizens of that barangay get rows; `recipients_count` set |
| IT-22 | Export | CSV contains no name/mobile columns; description beginning with `=` | none; prefixed `'` |
| IT-23 | Realtime | insert incident while an SSE client listens (TMO vs DRRMO user) | event only to the user in scope |

Use `setSmsProvider()` and `setPushProvider()` (test hooks in `src/lib/providers/*`) to capture outbound messages.

## 3. End-to-end lifecycle test

Preconditions: `pnpm db:reset`; app running; console providers.

| Step | Actor / source | Action | Check |
|---|---|---|---|
| E1 | Citizen +639170000001 (app) | OTP sign-in; POST SOS EMR_FLOOD with photo | 201, `NVP-EMR-…`; dashboard SSE event within 2 s |
| E2 | SMS | POST inbound NVP1 SOS from +639170000002 | incident `source=sms`, ack SMS logged |
| E3 | NavoBot | POST ticket with barangay only | incident `source=navobot`, `location_source=barangay_centroid`, INQ created |
| E4 | dispatch@ | Verify E1, assign DRRMO Rescue Team Alpha | statuses + history; citizen in-app + push rows |
| E5 | responder@ | List shows only E1; set in_progress; upload resolution photo; resolve | resolved; unit available; `feedback_request` notification |
| E6 | Citizen | GET my report; sees resolution photo and history; rate 5 | feedback row; analytics satisfaction updates |
| E7 | dispatch@ | Merge E2 into E1 (if same area) | E2 `duplicate`; SMS to E2 reporter "Tracked under …" |
| E8 | admin@ | Audit log shows E4–E7 actions and `pii.view` | rows present |

`apps/web/test/lifecycle.test.ts` automates E1, E4–E6 at the library level and the SMS/NavoBot pieces separately; extend it to chain E2, E3, E7, E8 through the HTTP route handlers. Run the same flow manually in browsers for the demo (see `14-demo-script.md`).

## 4. Load test plan

Script: `tests/load/incidents.k6.js`.

```bash
# seed 5,000 incidents for the map target
SEED_INCIDENTS=5000 pnpm db:seed
pnpm build && pnpm start                    # production build, not dev mode
k6 run -e BASE_URL=http://localhost:3000 tests/load/incidents.k6.js
k6 run -e BASE_URL=https://staging.example -e DASH_VUS=30 -e CITIZEN_VUS=20 -e DURATION=10m tests/load/incidents.k6.js
```

| Scenario | Load | Thresholds |
|---|---|---|
| `dashboard`: GET `/api/incidents?limit=5000` + `/api/analytics/summary` as dispatch@ | 10 VUs (baseline), 30 VUs (peak: all dispatch/TMO/PIO consoles during a typhoon), think time 1–3 s | p95 < 500 ms for each; checks > 99%; errors < 1% |
| `citizens`: OTP login then POST EMR_FLOOD with random `clientId`, location lat 14.64–14.69, lng 120.935–120.96; 10% idempotent retries | 5 VUs baseline, 20 VUs storm surge, think 2–5 s | p95 < 500 ms; retries return 200 with same control number |
| Soak | baseline for 1 h | no memory growth in the Node process; DB connections stable (pool max 10) |
| Map rendering (browser) | 5,000 pins in Chrome on a mid-range laptop | first render < 3 s; pan/zoom ≥ 30 fps with clustering (Chrome DevTools Performance) |

Notes:
- The OTP endpoint is rate limited per IP; the script sends a synthetic `X-Forwarded-For` per VU (`SPOOF_XFF=1`). On staging behind a proxy that overwrites the header, set `SPOOF_XFF=0` and temporarily raise the limits.
- Record server CPU/RAM, Postgres `pg_stat_statements` top queries, and `EXPLAIN ANALYZE` of the list query at 5,000 and 50,000 rows.
- Clean up load-test data on staging:

```sql
BEGIN;
DELETE FROM incidents WHERE description LIKE 'k6 load test:%';
DELETE FROM users WHERE role = 'citizen' AND full_name LIKE 'Load Test %';
COMMIT;
```

## 5. GPS precision test plan

Goal: measure how far the reported point is from the true location, for device GPS and for EXIF, so the dashboard's accuracy display and the 150 m duplicate radius are justified.

- **Reference points:** 10 points across both districts (e.g. City Hall, fish port, a narrow alley in Tangos, a covered court in NBBS, a coastal street in Tanza), coordinates surveyed with a survey-grade GNSS or taken from the city's GIS office.
- **Devices:** at least 3 Android (low, mid, high tier; Android 9+), 1 iPhone (iOS 15+); browsers Chrome and Safari.
- **Conditions per point:** open sky, under roof/inside a house, narrow alley between buildings, and during rain if possible; location permission "precise".
- **Procedure:** at each point, 5 SOS submissions (test category or staging) spaced 1 minute apart, plus 3 photos with camera location on. Record `location_accuracy_m`, `location_source`, time-to-fix.
- **Measure:** error = `ST_Distance(reported::geography, reference::geography)`.

```sql
SELECT i.control_number, i.location_source, i.location_accuracy_m,
       round(ST_Distance(i.location::geography, ST_SetSRID(ST_MakePoint(:ref_lng, :ref_lat), 4326)::geography)) AS error_m
FROM incidents i WHERE i.description LIKE 'GPS test P01%';
```

- **Report:** mean, median, 95th percentile error by device and condition; % where error ≤ reported accuracy; time-to-first-fix.
- **Acceptance (proposed):** median error ≤ 15 m outdoors, ≤ 50 m indoors; 95% of points inside the correct barangay (check `barangay_id` against the expected barangay; note boundaries are approximations until official ones are loaded). Also verify SMS payload rounding (5 decimals ≈ 1.1 m) does not add error.

## 6. Low-connectivity and SMS delivery test plan

| ID | Condition | Steps | Expected |
|---|---|---|---|
| LC-01 | Airplane mode | Submit SOS | Saved to offline queue, "waiting to send" shown; sent automatically when online; one incident (same `clientId`) |
| LC-02 | 2G/EDGE throttling (Chrome DevTools "Slow 3G" and a real 2G SIM) | Submit SOS with photo | Completes or queues; photo compressed (< 500 KB); no duplicate on retry |
| LC-03 | Data off, cellular on | Use "Send via SMS instead" | SMS composer pre-filled with NVP1 payload ≤ 160 chars, to the number from `/api/public/config` |
| LC-04 | SMS gateway | Send the payload from Globe, Smart, DITO SIMs | Incident created; record time from send to dashboard alert and to ack SMS |
| LC-05 | SMS then data | Send SMS, then go online so the queue flushes | Still one incident |
| LC-06 | Hand-typed | Send `NVP1 SOS MED 14.6492,120.9478` | Incident created with peopleAffected 1 |
| LC-07 | Bad payload | Send `NVP1 SOS` only | Logged with parse error; "call 911" reply |
| LC-08 | Provider retry | Replay the same webhook (same messageId) | `duplicate:true`, no new incident |
| LC-09 | Status SMS | Resolve an SMS-sourced incident | Reporter receives status SMS (no account) |
| LC-10 | Advisory SMS | Critical advisory to a barangay with a citizen without device token | SMS fallback delivered; logged |

Metrics: delivery success rate per network (target ≥ 95%), median and p95 latency SMS-sent → incident created (target ≤ 60 s, provider dependent), ack SMS latency. Record provider message IDs for each test.

## 7. Security tests

- RBAC matrix (IT-04) and scope (IT-05).
- Webhooks: no auth, wrong key, stale timestamp, modified body (all 401).
- Upload: polyglot file, SVG, oversized (415/413).
- Rate limits: login 11× in 5 min (429), OTP 4× per number.
- Headers: check HSTS, nosniff, frame options in production build (`curl -I`).
- Session: logout then reuse token (401); disable user then reuse token (401).
- Run OWASP ZAP baseline scan against staging; triage findings into `07-security-privacy.md`.

## 8. UAT checklist

Participants: DRRMO dispatcher, TMO officer, field responder, PIO admin, super admin (LGU), and 5 to 10 residents. Mark Pass/Fail and note issues.

**Citizen (PWA, phone)**
- [ ] Install the PWA to the home screen (Android Chrome, iOS Safari)
- [ ] Sign in with OTP; first-time registration requires the privacy consent
- [ ] Switch language Filipino ↔ English
- [ ] SOS reachable in one tap from Home; send Flood SOS with photo; see control number
- [ ] Send SOS in airplane mode; it is queued; sent on reconnect
- [ ] Use "Send via SMS instead"
- [ ] Report illegal parking with a photo that has GPS; location taken from the photo
- [ ] My reports shows status history; resolution photo visible after resolution
- [ ] Receive notification on status change; rate the service
- [ ] View advisories, Transport Hub, Barangay Directory, Angat Navotas
- [ ] Ask NavoBot 5 questions from the test script, including one emergency
- [ ] Guest mode: can view advisories but cannot submit

**DRRMO dispatcher**
- [ ] Sign in; map shows DRRMO incidents only; clustering, heatmap, boundaries
- [ ] New SOS triggers sound + visual alert without refreshing
- [ ] Filter by status, barangay, date, source
- [ ] Open detail; reporter visible; possible duplicates listed
- [ ] Verify; assign a unit; copy Navigate link
- [ ] Merge a duplicate; reject a prank
- [ ] Send a barangay-targeted flood warning (push + SMS)
- [ ] View notification log and SMS log
- [ ] View analytics; export CSV and Excel

**TMO officer**
- [ ] Sees traffic/DisipliNavo and TMO civic reports only
- [ ] Assigns TMO Enforcer Team A; resolves an illegal parking report

**Field responder (phone)**
- [ ] Sees only assigned incidents
- [ ] Start, upload resolution photo, resolve
- [ ] Update unit availability
- [ ] Reveal reporter contact (and it appears in the audit log)

**PIO admin**
- [ ] Edit an announcement, event, business, transit route, barangay hotline
- [ ] Sees NavoBot tickets; reporter masked
- [ ] Broadcast city-wide advisory

**Super admin**
- [ ] Create a staff user; set role; link responder to unit; disable user (sessions end)
- [ ] Audit log filter `pii.` shows views and reveals

**Exit criteria:** all must-have items pass; no open critical/high defects; NavoBot safety cases 100%.
