# NavoPulse Operational Runbook

Audience: City IT/MIS and the developer on call. Commands assume a Linux host with Docker and Docker Compose v2.

Files: `docker-compose.yml` (repo root), `apps/web/Dockerfile`, `.env.example`, `.dockerignore`. Configuration is read in `apps/web/src/lib/env.ts` plus a few direct `process.env` reads listed below.

## 1. Environment variables

| Variable | Required in production | Default (dev only) | Purpose |
|---|---|---|---|
| `NODE_ENV` | `production` | — | Enables strict secret checks, HSTS, secure cookies, hides OTP |
| `DATABASE_URL` | yes | `postgres://navopulse:navopulse@localhost:5432/navopulse` | PostgreSQL 16 + PostGIS |
| `SESSION_SECRET` | yes | dev string | HS256 key for session JWTs (≥ 32 random bytes) |
| `DATA_ENCRYPTION_KEY` | yes | dev key | 32 bytes base64 for AES-256-GCM and lookup hashes. `openssl rand -base64 32`. **Losing it makes encrypted numbers unreadable; changing it breaks lookups.** |
| `NAVOBOT_WEBHOOK_SECRET` | yes | `dev-navobot-secret` | HMAC secret for NavoBot webhook |
| `NAVOBOT_API_KEY` | recommended | none | Enables `X-Api-Key` auth for the Power Automate flow |
| `SMS_INBOUND_SECRET` | yes | `dev-sms-inbound-secret` | Shared secret for the inbound SMS webhook |
| `SMS_PROVIDER` | — | `console` | `console`, `semaphore`, `twilio` |
| `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME` | if semaphore | sender `NAVOPULSE` | Semaphore credentials; sender name must be registered with the provider |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | if twilio | — | Twilio credentials |
| `PUSH_PROVIDER` | — | `console` | `console` or `fcm` |
| `FCM_SERVICE_ACCOUNT_JSON` | if fcm | — | Firebase service-account JSON (one line) |
| `STORAGE_DIR` | — | `<cwd>/storage` | Photo storage path (mount a volume) |
| `APP_URL` | yes (for links) | `http://localhost:3000` | Public base URL; used in NavoBot `trackUrl` |
| `COPILOT_TOKEN_ENDPOINT` or `DIRECTLINE_SECRET` | for live NavoBot | none | Web Chat token source; unset = demo bot |
| `NEXT_PUBLIC_SMS_GATEWAY_NUMBER` | yes | placeholder `+639000000000` | Number the PWA texts in SMS fallback |
| `NEXT_PUBLIC_HOTLINE_DRRMO`, `NEXT_PUBLIC_HOTLINE_PNP`, `NEXT_PUBLIC_HOTLINE_BFP` | yes | placeholder text | Hotlines shown to citizens. Use numbers confirmed in writing by the offices |
| `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | — | OpenStreetMap | Map tiles (use a tile provider or own tile server for heavy production traffic; OSM's public tiles have a usage policy) |
| `NAVOPULSE_DEMO_OTP` | **never in prod** | — | `1` returns OTP codes in the API (demo days only) |
| `NAVOPULSE_ALLOW_DEV_SECRETS` | **never in prod** | — | `1` lets production start with dev secrets |
| `NEXT_PUBLIC_DEMO_MODE` | `0` in prod | `1` in `.env.example` | Lists the demo logins on the dashboard sign-in page |
| `POSTGRES_PASSWORD` | yes | `navopulse` | Used by `docker-compose.yml` for the `db` service and the `DATABASE_URL` it injects |
| `SEED_INCIDENTS` | — | 600 | Number of demo incidents for `pnpm db:seed` |
| `TEST_DATABASE_URL` | — | `…/navopulse_test` | Integration tests |

**Build-time variables.** Next.js inlines `process.env.NEXT_PUBLIC_*` into the bundle during `next build`. `.dockerignore` excludes `.env`, and `apps/web/Dockerfile` declares no build `ARG`s, so an image built as-is bakes these values as unset (placeholders for hotlines and gateway number, OSM tiles, demo mode off) regardless of the runtime `.env`. Until the Dockerfile takes build args, build with the values exported in the build stage, or verify after deployment that `/api/public/config` shows the real hotlines and gateway number.

**Empty values.** `.env.example` lists every variable with an empty value. For `STORAGE_DIR`, `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_HOTLINE_*`, delete the line rather than leaving it empty: `STORAGE_DIR=` in `.env` overrides the Dockerfile's `STORAGE_DIR=/data/storage` with an empty string, `env.ts` then falls back to `/app/storage` (not the `uploads` volume, and not writable by the `navopulse` user); the map and config code use `??`, so an empty string replaces the default instead of falling back to it.

Generate secrets:

```bash
openssl rand -base64 32   # DATA_ENCRYPTION_KEY
openssl rand -hex 32      # SESSION_SECRET, NAVOBOT_WEBHOOK_SECRET, NAVOBOT_API_KEY, SMS_INBOUND_SECRET
```

Store them in the server's `.env` (mode 600, owned by the deploy user) or a secrets manager. Never commit them.

## 2. Deployment with Docker Compose

### 2.1 What the compose file defines

| Service | Image / target | Purpose |
|---|---|---|
| `db` | `postgis/postgis:16-3.4`, volume `pgdata`, port 5432 | Database |
| `migrate` | `apps/web/Dockerfile` target `tools`, profile `tools` | `pnpm db:migrate` |
| `seed` | same, profile `tools` | `pnpm db:seed` (**truncates all tables**, demo data) |
| `web` | `apps/web/Dockerfile` final stage (Next standalone, non-root user `navopulse`, healthcheck on `/api/health`), port 3000, volume `uploads:/data/storage` | App |

The compose file publishes 5432 and 3000 on all interfaces. On a server, change them to `127.0.0.1:5432:5432` and `127.0.0.1:3000:3000` (or remove the db port) so only the reverse proxy is reachable from outside.

### 2.2 First deployment
1. Provision a VM (2 vCPU, 4 GB RAM, 40 GB disk is enough for the pilot), set the timezone to Asia/Manila, enable automatic security updates and a firewall (allow 22 from admin IPs, 80/443).
2. Clone the repository; `cp .env.example .env`; fill in secrets (§1) (`NODE_ENV=production` is already set inside the image); set `NAVOPULSE_DEMO_OTP=0`, `NEXT_PUBLIC_DEMO_MODE=0`; remove empty lines noted above.
3. `docker compose up -d db`
4. `docker compose run --rm migrate`
5. Seed **only on staging/demo**: `docker compose run --rm seed`. For production, load barangays, categories, units and the first super admin with a production seed reviewed by the City, and official boundaries. (The seed's `SEED_INCIDENTS` controls the number of demo incidents; `SEED_INCIDENTS=5000` for map load tests.)
6. `docker compose up -d --build web`
7. Reverse proxy with TLS (Caddy example):

```caddyfile
navopulse.example.gov.ph {
  encode gzip
  reverse_proxy 127.0.0.1:3000 {
    header_up X-Forwarded-For {remote_host}   # overwrite, never pass client-supplied values
    flush_interval -1                         # needed for SSE /api/incidents/stream
  }
}
```

   With Nginx: `proxy_set_header X-Forwarded-For $remote_addr;` and, for `/api/incidents/stream`, `proxy_buffering off; proxy_read_timeout 1h;`. The app trusts the first `X-Forwarded-For` entry for rate limits and audit IPs, so the proxy must overwrite it.
8. Check: `curl -fsS https://<host>/api/health` → `{"status":"ok","db":"ok",…}`; `curl -fsS https://<host>/api/public/config` shows the real hotlines and gateway number; sign in as super admin; create real staff; disable demo accounts.
9. Configure providers (§5, §6), the SMS inbound webhook URL `https://<host>/api/integrations/sms/inbound` with header `X-Webhook-Secret`, and the Power Automate flow URL (`05-navobot-copilot-studio.md`).

### 2.3 Local development without Docker for the app

```bash
corepack enable && pnpm install
docker compose up -d db
pnpm db:migrate && pnpm db:seed
pnpm dev            # http://localhost:3000/app and /dashboard
pnpm test           # needs a navopulse_test database (CI creates it); vitest globalSetup resets and seeds it
```

### 2.4 Updates
1. Take a backup (§3.1).
2. `git pull` and read the changelog for new migrations or env vars.
3. `docker compose run --rm --build migrate` (forward-only, each file in a transaction).
4. `docker compose up -d --build web`.
5. Check `/api/health`, sign in, open the map, submit a staging test report.
6. Rollback: redeploy the previous image tag. If a migration must be reverted, restore the pre-update backup (migrations are forward-only).

## 3. Backups and restore

### 3.1 Schedule
| What | How | When | Keep |
|---|---|---|---|
| Database | `pg_dump -Fc` | Nightly 02:00 + before every update | 35 daily, 12 monthly |
| Photos (`uploads` volume) | `rsync`/`rclone` to off-site | Nightly | Same as DB |
| `.env` / secrets | Encrypted copy in the City's password vault | On change | Current + previous |

`DATA_ENCRYPTION_KEY` must be backed up separately from the database dumps (a dump without the key is unreadable; a dump with the key next to it is not protected).

Nightly cron on the host (`/etc/cron.d/navopulse-backup`):

```bash
0 2 * * * root /opt/navopulse/backup.sh >> /var/log/navopulse-backup.log 2>&1
```

`/opt/navopulse/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M)
DIR=/var/backups/navopulse
mkdir -p "$DIR"
docker compose -f /opt/navopulse/docker-compose.yml exec -T db \
  pg_dump -U navopulse -Fc navopulse > "$DIR/navopulse-$TS.dump"
docker run --rm -v navopulse_uploads:/s -v "$DIR":/b alpine tar czf "/b/storage-$TS.tgz" -C /s .
find "$DIR" -name 'navopulse-*.dump' -mtime +35 -delete
find "$DIR" -name 'storage-*.tgz' -mtime +35 -delete
# copy off-site, e.g.: rclone copy "$DIR" offsite:navopulse-backups --max-age 25h
```

(The volume name depends on the compose project name; check with `docker volume ls`.)

### 3.2 Restore drill (monthly; record the result)
1. Start a scratch PostGIS container: `docker run -d --name np-restore -e POSTGRES_PASSWORD=x postgis/postgis:16-3.4`
2. `docker exec np-restore createdb -U postgres navopulse`
3. `docker exec -i np-restore pg_restore -U postgres -d navopulse --no-owner < navopulse-<TS>.dump`
4. Verify: `SELECT count(*) FROM incidents; SELECT max(created_at) FROM incidents; SELECT count(*) FROM schema_migrations;`
5. Point a staging app at it with the production `DATA_ENCRYPTION_KEY` and open one incident detail to confirm reporter numbers decrypt.
6. Record time to restore (target RTO ≤ 4 h, RPO ≤ 24 h), then remove the container.

## 4. Monitoring

| Check | How | Alert when |
|---|---|---|
| Liveness | `GET /api/health` every minute (Uptime Kuma, UptimeRobot, Azure Monitor) | non-200 twice in a row; `latencyMs` > 500 |
| Container | `docker compose ps`, restart count | restarts > 3/hour |
| Disk | `df -h` for pgdata, storage, backups | > 80% |
| Database | connections (`pg_stat_activity`), slow queries (`log_min_duration_statement = 500ms`) | connections near `max_connections`; slow queries repeating |
| Backups | log of `backup.sh`, size of newest dump | missing or much smaller than usual |
| App logs | `docker compose logs -f web` | `[api] unhandled error`, `[realtime] listener connection lost`, `[notify]` errors |
| Security | audit log: `auth.login_failed` spikes, `pii.reveal` volume; 401s on webhooks in proxy logs | unusual spikes |
| SMS/push | Notification log failures | failure rate > 5% over an hour |

## 5. SMS troubleshooting

| Symptom | Check | Fix |
|---|---|---|
| OTP not received | Notification log / SMS log row for the number (`kind=otp`), status `failed` + error | Wrong `SMS_PROVIDER`, missing API key, no credit, unregistered sender name, number format. With `console` provider, messages only appear in `docker compose logs web` (`[sms:console]`) |
| Startup error `SMS_PROVIDER=semaphore requires SEMAPHORE_API_KEY` | `.env` | Set the key or switch to console |
| Inbound SOS not creating incidents | Provider dashboard shows webhook calls? Proxy log for `/api/integrations/sms/inbound` status | 401 → secret mismatch (`X-Webhook-Secret` or `?secret=`); 400 → provider sends different field names (route accepts `from`/`mobile_number`/`From` and `body`/`message`/`text`/`Body`); 200 with `ok:false` → payload not parseable (see SMS log `parse_error`) |
| Duplicate incidents from one SMS | `sms_messages.provider_message_id` empty | Configure the provider to send its message ID (`messageId`/`MessageSid`) |
| Citizen got "We could not read your SOS message" | SMS log body | Hand-typed payload malformed; contact by phone |
| Rate limited (429) for a sender | > 10 inbound SMS per sender per 10 min | Expected protection; call the sender |
| Delivery slow | Provider status page; test with each network (Globe/Smart/DITO) | Escalate to provider; consider a second provider |

Manual test of the inbound route: see `06-api.md` §10.2.

## 6. Push troubleshooting (FCM)

| Symptom | Check | Fix |
|---|---|---|
| Startup error `PUSH_PROVIDER=fcm requires FCM_SERVICE_ACCOUNT_JSON` | `.env` | Paste the service-account JSON as one line |
| All push `failed` with auth errors | Notification log error text | Service account lacks "Firebase Cloud Messaging API Admin" role, or the FCM HTTP v1 API is disabled in the Google Cloud project |
| Some citizens never get push | `device_tokens` row exists for the user? | Citizen denied notification permission or uses iOS Safari without installing the PWA (web push on iOS needs the PWA added to the Home Screen, iOS 16.4+); they still get SMS fallback for status changes |
| Tokens disappearing | FCM returned `UNREGISTERED`/`NOT_FOUND` | Expected: the app deletes dead tokens; the PWA re-registers on next open |
| Push says sent but nothing appears | Console provider still active (`PUSH_PROVIDER` unset) | Set `PUSH_PROVIDER=fcm` |

## 7. Incident handling (operational and security)

### 7.1 Service outage during an emergency
1. Announce on official channels that residents should **call 911 / DRRMO hotline**; NavoPulse is not the only channel.
2. Check `/api/health`; `docker compose ps`; `docker compose logs --tail 200 web db`.
3. DB down → restart `db`; disk full → free space (old backups, logs); then restart `web`.
4. If the app server is lost, deploy on a standby VM from the latest image and backup (§3.2).
5. SMS gateway still receives SOS while the app is down; the provider retries webhooks (check its retry window). After recovery, review the SMS log for messages without `parsed_incident_id` and create them as walk-in reports if needed.
6. After recovery: post-incident review within 5 working days.

### 7.2 Realtime map not updating
`[realtime] listener connection lost` in logs → the listener reconnects automatically within seconds when a stream is open. If the map stays stale: check that the proxy does not buffer SSE (§2.3), then restart `web`. Dashboards fall back to manual refresh.

### 7.3 Suspected data breach
1. Contain: disable affected accounts (Users), rotate secrets (§9), block IPs at the proxy.
2. Preserve evidence: copy audit logs, proxy logs and a DB snapshot.
3. Notify the City DPO immediately. The DPO notifies the National Privacy Commission and affected data subjects within **72 hours** of knowledge where required (NPC Circular 16-03).
4. Review `audit_logs` (`pii.view`, `pii.reveal`, `analytics.export`, `user.*`) for the period.

### 7.4 Wrong or harmful public information
- Wrong advisory: send a correction advisory immediately (same targets), referencing the earlier title.
- Wrong NavoBot answer about floods/evacuation/hotlines: disable the affected knowledge source or topic in Copilot Studio, fix the document, retest (see `13-pio-handover.md`).

## 8. Data retention job

`apps/web/scripts/retention.ts` applies these periods (`pnpm --filter @navopulse/web tsx scripts/retention.ts`; schedule it daily after the nightly backup, once the City approves the periods in `07-security-privacy.md` §4). The equivalent SQL is below for manual runs; run it inside a transaction and check counts first.

```sql
BEGIN;
-- Auth artefacts
DELETE FROM otp_codes WHERE expires_at < now() - interval '1 day';
DELETE FROM sessions WHERE COALESCE(revoked_at, expires_at) < now() - interval '30 days';
DELETE FROM device_tokens WHERE last_seen_at < now() - interval '180 days';

-- OTP message bodies
DELETE FROM sms_messages WHERE direction = 'outbound' AND body LIKE 'Your NavoPulse code is%' AND created_at < now() - interval '7 days';
DELETE FROM notifications WHERE kind = 'otp' AND created_at < now() - interval '7 days';

-- Logs
DELETE FROM sms_messages WHERE created_at < now() - interval '1 year';
DELETE FROM notifications WHERE created_at < now() - interval '1 year';
DELETE FROM audit_logs WHERE created_at < now() - interval '5 years';

-- Anonymise old incidents (EMR after 5 years, CIV/TRF after 3 years from resolution or creation)
UPDATE incidents SET reporter_id = NULL, reporter_name_enc = NULL, reporter_mobile_enc = NULL, reporter_mobile_hash = NULL
WHERE (reporter_id IS NOT NULL OR reporter_mobile_enc IS NOT NULL OR reporter_name_enc IS NOT NULL)
  AND COALESCE(resolved_at, created_at) < now() - CASE WHEN module = 'emergency' THEN interval '5 years' ELSE interval '3 years' END;
UPDATE feedback SET citizen_id = NULL WHERE created_at < now() - interval '3 years';
COMMIT;
```

Report photos older than one year after resolution: list them, then delete the files from storage and the rows:

```sql
SELECT m.id, m.storage_key FROM incident_media m JOIN incidents i ON i.id = m.incident_id
WHERE m.type = 'report' AND i.resolved_at < now() - interval '1 year';
```

Record each run (date, row counts, operator) in the City's records-disposal log.

## 9. Rotating secrets

| Secret | Steps | Impact |
|---|---|---|
| `SESSION_SECRET` | Replace, restart `web` | Everyone is signed out (staff and citizens sign in again) |
| `NAVOBOT_API_KEY` | Set new value; update the Power Automate HTTP action (or Key Vault secret); restart; test a ticket | Flow fails until updated: do both within minutes, at a quiet time |
| `NAVOBOT_WEBHOOK_SECRET` | Same as above for any HMAC caller | — |
| `SMS_INBOUND_SECRET` | Update provider webhook header/URL and `.env` together; restart | Inbound SMS rejected (401) in between; providers usually retry |
| Provider keys (Semaphore/Twilio/FCM) | Create new key at the provider, update `.env`, restart, revoke old key | — |
| DB password | `ALTER ROLE navopulse PASSWORD '…'`, update `.env`/compose, restart | Short outage |
| `DATA_ENCRYPTION_KEY` | **Do not change in place.** Requires a re-encryption script (decrypt with old key, encrypt with new, recompute all `*_hash` columns) which is not built yet. Rotate only if the key is compromised, with the developer, during a maintenance window and after a verified backup | Without re-encryption, all stored numbers become unreadable and lookups fail |

## 10. Routine checklist

| Daily | Weekly | Monthly | Before typhoon season |
|---|---|---|---|
| Health check green; no unhandled errors; backup log OK | Review `auth.login_failed` and `pii.` audit entries; notification failure rate; disk | Restore drill; retention SQL; OS/Docker updates; `pnpm audit` | Load test on staging; confirm hotlines and SMS gateway number; refresh SMS credit; test FCM and SMS end to end; verify DRRMO units and responder accounts; run the NavoBot flood test cases |
