# NavoPulse

Smart city civic engagement, disaster response, and AI-assisted public service platform for **Navotas City**. Capstone project, Master in Information Technology (System Administration), Our Lady of Fatima University, Valenzuela.

One Next.js application serves three things from one backend and one PostgreSQL/PostGIS database:

| Part | URL | Who |
|---|---|---|
| Citizen app (installable PWA) | `/app` | Residents: one-tap SOS with offline SMS fallback, DisipliNavo Cam reporting, report tracking and rating, NavoBot chat, Transport Hub, Barangay Directory, Angat Navotas, advisories, Filipino/English |
| LGU Web Command Dashboard | `/dashboard` | DRRMO dispatchers, TMO officers, field responders, PIO admins, super admins |
| REST API + notification engine | `/api/*` | The two apps above, NavoBot (Copilot Studio via Power Automate), the SMS gateway |

## Quick start (local, no Docker)

Requirements: Node 22, pnpm 10, PostgreSQL 15+ with PostGIS 3.

```bash
pnpm install
# create a database user and two databases (one for tests)
createuser -s navopulse && psql -c "ALTER USER navopulse PASSWORD 'navopulse'"
createdb -O navopulse navopulse && createdb -O navopulse navopulse_test
pnpm db:migrate        # schema (enables PostGIS)
pnpm db:seed           # 18 barangays, categories, units, demo accounts, ~600 sample incidents
pnpm dev               # http://localhost:3000
```

No `.env` is needed for local development: every secret has an insecure development default and SMS/push are printed to the server console. Copy `.env.example` to `apps/web/.env.local` to change anything.

## Quick start (Docker)

```bash
cp .env.example .env            # fill in SESSION_SECRET, DATA_ENCRYPTION_KEY, SMS_INBOUND_SECRET at least
docker compose up -d db
docker compose run --rm migrate
docker compose run --rm seed    # optional demo data
docker compose up -d web        # http://localhost:3000
```

## Demo accounts

Dashboard (`/dashboard/login`), password `NavoPulse!2026` for all:

| Email | Role | Sees |
|---|---|---|
| `admin@navopulse.local` | Super admin | Everything, users, audit log |
| `dispatch@navopulse.local` | DRRMO dispatcher | Emergency + drainage incidents, crews, broadcasts |
| `tmo@navopulse.local` | TMO officer | Traffic and DisipliNavo reports |
| `pio@navopulse.local` | PIO admin | NavoBot tickets, PIO concerns, content, broadcasts |
| `responder@navopulse.local` | Field responder (Rescue Team Alpha) | Only incidents assigned to their unit |
| `enforcer@navopulse.local` | Field responder (TMO Enforcer Team A) | Only incidents assigned to their unit |

Citizen app (`/app/login`): any PH mobile number. In development the one-time code is shown on screen instead of being texted. Seeded residents use `0917 000 0001` to `0917 000 0004`; a new number walks through registration with the privacy consent.

## What to try

1. Open `/dashboard` as `dispatch@` in one window and `/app` as a resident on a phone-sized window.
2. Press **SOS**, pick **Baha**, send. The pin appears on the dashboard map within a second with an audible alert (Server-Sent Events from Postgres `LISTEN/NOTIFY`).
3. Verify it, **Assign crew** → *DRRMO Rescue Team Alpha*, then sign in as `responder@`, **Start response**, **Resolve** with a photo.
4. Back in the citizen app, **My reports** shows the timeline, the resolution photo and the rating prompt.
5. Turn the network off in the browser's dev tools and send a report: it is queued and retried, and the SOS screen shows the ready-made SMS for the offline gateway.
6. Run the scripted lifecycle (all three intake channels, about 30 checks): `pnpm --filter @navopulse/web e2e` while the dev server runs.

## Tests and checks

```bash
pnpm lint        # ESLint + tsc for the shared package
pnpm typecheck
pnpm test        # shared unit tests + integration tests against navopulse_test (PostGIS)
pnpm --filter @navopulse/web e2e    # HTTP end-to-end against a running server (BASE_URL)
k6 run tests/load/incidents.k6.js   # load test (see docs/08-testing-plan.md)
```

## Repository layout

```
apps/web/                  Next.js 16 app: dashboard, citizen PWA, API route handlers
  db/migrations/           SQL migrations (PostGIS geometry, GIST indexes, realtime + barangay triggers)
  scripts/                 migrate, seed, e2e, retention job, official boundary import
  src/app/api/             REST endpoints (docs/06-api.md; live OpenAPI 3.1 at /api/openapi.json)
  src/app/dashboard/       LGU Web Command Dashboard
  src/app/app/             Citizen PWA
  src/lib/                 auth, RBAC, incidents workflow, notifications, crypto, providers (SMS, push, storage)
  test/                    integration tests
packages/shared/           Types, constants, Zod schemas, control numbers, SMS payload codec, i18n strings
docs/                      SRS, architecture, ERD, NavoBot/Copilot Studio setup, API, security & RA 10173, manuals, runbook, demo script
tools/iso25010/            ISO/IEC 25010 questionnaire scoring script
tests/load/                k6 load test
```

## Key design decisions

- **One Next.js app instead of separate API and dashboard services.** Route handlers give a REST API with the same auth and types, and one deployable is easier for a city IT team to run.
- **Raw SQL migrations with `pg` instead of an ORM.** Most of the important queries are PostGIS (point-in-polygon barangay lookup, 150 m duplicate detection, heatmaps, distance), which ORMs only pass through as raw SQL anyway.
- **Realtime via Postgres `LISTEN/NOTIFY` + Server-Sent Events.** No extra broker to operate. For several web replicas, each replica listens independently, so it still works.
- **Idempotent intake.** Every report carries a client-generated UUID. The offline queue, SMS fallback (the UUID is in the SMS payload) and Power Automate retries can all resend safely.
- **Providers behind interfaces.** `SmsProvider` (console, Semaphore, Twilio), `PushProvider` (console, FCM HTTP v1) and `StorageProvider` (local disk or Supabase Storage) can be swapped by environment variable.
- **Privacy by default.** Mobile numbers and reporter names are AES-256-GCM encrypted at rest with keyed-hash lookups, masked for roles that do not need them, and every reveal is audit-logged.

## Third-party services you need to connect

Everything runs without these (stubs log to the console), but a real deployment needs:

| Service | Needed for | Settings |
|---|---|---|
| Microsoft Copilot Studio + SharePoint + Power Automate | NavoBot answers and tickets | `NAVOBOT_API_KEY` or `NAVOBOT_WEBHOOK_SECRET`; `COPILOT_TOKEN_ENDPOINT` or `DIRECTLINE_SECRET` for the embedded chat. Setup: `docs/05-navobot-copilot-studio.md` |
| Semaphore (or Twilio) | OTP, SMS alerts, offline SOS gateway | `SMS_PROVIDER`, `SEMAPHORE_API_KEY` (or `TWILIO_*`), `SMS_INBOUND_SECRET`, `NEXT_PUBLIC_SMS_GATEWAY_NUMBER` |
| Firebase Cloud Messaging | Push notifications | `PUSH_PROVIDER=fcm`, `FCM_SERVICE_ACCOUNT_JSON` |
| Supabase | Postgres database and/or photo storage | `DATABASE_URL` (session pooler, `sslmode=require`); `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for storage. PostGIS/citext/pgcrypto must be enabled (`CREATE EXTENSION` in the migration) |
| Mapbox (optional) | Alternative base map | `NEXT_PUBLIC_MAP_TILE_URL` |

## Known limitations of this prototype

- **The native Expo mobile app is not built yet.** The citizen features run as an installable PWA at `/app`; the API (Bearer tokens, device-token registration, idempotent intake) is ready for an Expo client.
- **Demo data is not official.** Barangay boundaries are generated (Voronoi cells clipped to a rough city outline) from approximate centroids; replace them with PSA/NAMRIA polygons via `scripts/import-boundaries.ts`. Officials, local hotline numbers and businesses are placeholders; set the real hotlines through `NEXT_PUBLIC_HOTLINE_*` only after the city confirms them.
- Web push in the browser needs the FCM web SDK and a VAPID key; until then the PWA uses the in-app inbox and SMS fallback.
- Rate limiting is in-process memory; put it on Redis when running more than one web replica.
- File storage is local disk by default; set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for Supabase Storage, or attach a persistent volume in production.
- PDF export of analytics uses the browser's print-to-PDF.
