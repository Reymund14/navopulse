# NavoPulse Documentation

NavoPulse is a smart city civic engagement, disaster response and AI public assistance platform for Navotas City, built as a capstone project (MIT System Administration, Our Lady of Fatima University). One Next.js 16 app (`apps/web`) serves the citizen PWA at `/app`, the LGU Command Dashboard at `/dashboard` and the REST API at `/api`, on PostgreSQL 16 + PostGIS.

## Documents

| # | Document | For | Contents |
|---|---|---|---|
| 01 | [Software Requirements Specification](01-SRS.md) | Panel, developer, testers | Scope, roles, FR-xx with build status, NFRs mapped to ISO/IEC 25010, use cases |
| 02 | [System Architecture](02-architecture.md) | Developer, IT | Container diagram, code layout, request pipeline, sequence diagrams (app SOS, SMS SOS, NavoBot ticket, dispatch→resolve→rate), deployment view |
| 03 | [Data Model](03-data-model.md) | Developer | ERD matching `001_init.sql`, PostGIS columns and indexes, encryption columns, triggers, control numbers, status workflow |
| 04 | [SharePoint Knowledge Base](04-sharepoint-knowledge-base.md) | PIO, IT | Site and libraries, metadata, naming, content workflow, indexing tips |
| 05 | [NavoBot in Copilot Studio](05-navobot-copilot-studio.md) | PIO, Copilot maker | Setup steps, system instructions, topics, report-an-issue flow, Power Automate design, Web Chat embedding, test script |
| 06 | [API Reference](06-api.md) | Developer, integrators | Every route: auth, body, response, errors; curl for NavoBot (API key and HMAC) and inbound SMS |
| 07 | [Security and Privacy](07-security-privacy.md) | Panel, DPO, IT | OWASP Top 10 review with gaps, RA 10173 checklist, Privacy Notice (EN/FIL), retention periods |
| 08 | [Test Plan](08-testing-plan.md) | Testers | Unit/integration cases, E2E lifecycle, load, GPS precision, low-connectivity/SMS, UAT checklist |
| 09 | [ISO/IEC 25010 Evaluation](09-iso25010-evaluation.md) | Researcher | Resident and LGU questionnaires, scale, sampling and administration |
| 10 | [User Manual: Residents](10-user-manual-citizen.md) | Residents | Sign-in, SOS, SMS fallback, reports, rating, NavoBot, city info |
| 11 | [User Manual: LGU](11-user-manual-lgu.md) | City staff | DRRMO dispatcher, TMO officer, field responder, PIO admin, super admin |
| 12 | [Operational Runbook](12-runbook.md) | IT/MIS | Env vars, Docker Compose deployment, backups and restore drill, monitoring, SMS/push troubleshooting, incident handling, retention SQL, secret rotation |
| 13 | [PIO Handover](13-pio-handover.md) | PIO | Maintaining the KB and NavoBot topics, monthly test and report |
| 14 | [Demo Script](14-demo-script.md) | Presenter | Under-10-minute live defense walkthrough |
| 15 | [Android APK Packaging](15-apk-packaging.md) | Developer | TWA build via PWABuilder or Bubblewrap, assetlinks.json, downloadable APK hosting |

## Related files

| Path | What |
|---|---|
| `tests/load/incidents.k6.js` | k6 load test (map feed, analytics, citizen OTP + SOS creation) |
| `tools/iso25010/compute.py` | Weighted mean / SD / verbal interpretation / Cronbach's alpha from questionnaire CSV (stdlib only) |
| `tools/iso25010/sample_responses.csv` | **Synthetic** sample responses for testing the script |
| `apps/web/db/migrations/001_init.sql` | Database schema |
| `packages/shared/src/` | Constants, zod schemas, control-number and SMS-payload formats, UI strings |
| `docker-compose.yml`, `apps/web/Dockerfile`, `.env.example` | Deployment |

## Quick start (development)

```bash
corepack enable && pnpm install
docker compose up -d db
pnpm db:migrate && pnpm db:seed
pnpm dev
# Citizen PWA: http://localhost:3000/app       (demo citizens +639170000001..4; OTP is shown on screen in dev)
# Dashboard:   http://localhost:3000/dashboard (admin@, dispatch@, tmo@, pio@, responder@, enforcer@ navopulse.local / NavoPulse!2026)
```

```bash
python3 tools/iso25010/compute.py tools/iso25010/sample_responses.csv
k6 run -e BASE_URL=http://localhost:3000 tests/load/incidents.k6.js
```

## Important caveats

- **Native mobile app:** the Expo app in the spec is not built in this iteration. The citizen features are served by the PWA; the Android APK is a Trusted Web Activity wrapper around the deployed PWA, not a native app (see document 15).
- **Placeholder data:** local hotline numbers (DRRMO, PNP, BFP), the SMS gateway number, barangay hotlines and officials, and businesses in the seed are placeholders. Barangay boundaries are generated (Voronoi) approximations, not official PSA/NAMRIA boundaries. Nothing in the seed should be presented as real.
- **Demo-only switches:** demo accounts, on-screen OTP (`NAVOPULSE_DEMO_OTP`, dev mode) and `NEXT_PUBLIC_DEMO_MODE` must be off in production.
- Where a document describes something that is not built yet, it says so (see the Status column in the SRS).
