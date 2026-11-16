# Security Review and Data Privacy (RA 10173)

Scope: the code in `apps/web` and `packages/shared` as of this iteration. File paths are relative to `apps/web/` unless they start with `packages/`. "Gap" items are open findings; they are listed so the panel can see what is known and what is left, not hidden.

## 1. OWASP Top 10 (2021) review

| # | Risk | Controls in the code | Remaining gaps / recommendations |
|---|---|---|---|
| A01 | Broken Access Control | One permission matrix (`src/lib/rbac.ts`) checked by `requireUser()` on every non-public route (`src/lib/auth.ts`). Office scoping on every incident query, detail, mutation, media download, analytics and SSE event (`scopeSql`/`loadScoped` in `src/lib/incidents.ts`, `src/app/api/incidents/stream/route.ts`, `src/app/api/media/[id]/route.ts`, `src/lib/analytics.ts`). Out-of-scope IDs return 404. Citizens only reach their own records (`reporter_id = caller`). Responders limited to `in_progress` via status route and to their own unit (`src/app/api/units/[id]/route.ts`). Super admin cannot demote/disable self; citizen↔staff conversion blocked (`src/app/api/admin/users/[id]/route.ts`). `/dashboard/*` redirects without a session (`src/proxy.ts`); real checks are server-side. | (1) `POST /api/incidents/{id}/assign` does not check that the unit belongs to the incident's office (the dashboard's Assign dialog filters units by office, but the API accepts any unit). (2) `POST /api/units` lets a TMO officer create a DRRMO unit and vice versa. (3) `GET /api/inquiries` is not office-scoped (topics only, no PII). (4) No CSRF token: protection relies on `SameSite=Lax` cookies plus JSON bodies; keep Lax (never `None`) and consider an Origin check on state-changing routes. |
| A02 | Cryptographic Failures | AES-256-GCM field encryption with random 96-bit IV and auth tag for mobile numbers and reporter names (`src/lib/crypto.ts`); keyed HMAC-SHA256 lookup hashes instead of plaintext numbers; bcrypt for passwords and OTP codes; HS256-signed session JWT; HSTS and `Secure` cookies in production (`next.config.ts`, `src/lib/auth.ts`); production refuses to start without secrets (`src/lib/env.ts`). | (1) OTP codes are stored in plaintext in `sms_messages.body` and `notifications.payload` (kind `otp`); they are redacted in the SMS log view but remain in the DB and backups. Store a redacted body for `kind = otp`. (2) One key is used for both encryption and lookup hashes, and there is no key-rotation/re-encryption script. (3) `users.full_name` and free-text `description` are not encrypted. (4) TLS termination is outside the app; the runbook must enforce HTTPS-only. |
| A03 | Injection | All SQL uses `pg` parameter placeholders (`src/lib/db.ts`); the generic content CRUD only interpolates table/column names from the fixed `CONTENT_TYPES` allow-list (`src/lib/content.ts`); filter builders push values as parameters (`listIncidents`). zod validates every body and query (`packages/shared/src/schemas.ts`). CSV export neutralises formula injection (`src/app/api/analytics/export/route.ts`). React escapes all rendered text (SMS bodies, descriptions). | `q` search uses `ILIKE '%…%'` with user `%`/`_` wildcards not escaped (functional, not a security issue). Keep `dangerouslySetInnerHTML` out of the UI; add a lint rule. |
| A04 | Insecure Design | Idempotent creation (`client_id` unique; SMS `R` reference; deterministic NavoBot ID; unique provider message ID). Explicit, logged PII reveal instead of always-visible PII. Terminal statuses cannot be reopened. Bounding-box check on app reports. Webhooks return generic errors. Rate limits on login, OTP request/verify, incident creation, uploads, broadcasts, webhooks, token and demo bot (`src/lib/http.ts` callers). | (1) Rate limits are in process memory: they reset on restart and are per replica. Move to Redis/Postgres before scaling out. (2) Staff login is limited per IP only (10/5 min); a distributed attempt on one account is not slowed. Add per-account backoff/lockout. (3) Advisory fan-out runs synchronously inside the POST request (`deliverAdvisory`); a city-wide broadcast to many thousands of citizens will be slow and may time out. Move to a job queue. (4) NavoBot and SMS routes do not apply the Navotas bounding-box check. |
| A05 | Security Misconfiguration | `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, HSTS (prod), `poweredByHeader: false` (`next.config.ts`). Generic 500 messages; stack traces only in server logs (`route()` in `src/lib/http.ts`). Dev secrets are clearly named and rejected in production unless `NAVOPULSE_ALLOW_DEV_SECRETS=1`. Media served with `nosniff` and sniffed MIME type. | (1) **No Content-Security-Policy.** Add one (allow self, OSM tiles, Web Chat CDN, Direct Line). (2) `clientIp()` trusts the first `X-Forwarded-For` value. Unless the reverse proxy overwrites that header, clients can spoof their IP, which defeats IP rate limits and pollutes audit IPs. Configure the proxy to set it, and trust it only from the proxy. (3) `NAVOPULSE_ALLOW_DEV_SECRETS` and `NAVOPULSE_DEMO_OTP` must never be set in production; add a startup warning. |
| A06 | Vulnerable and Outdated Components | Exact versions locked in `pnpm-lock.yaml`; Node 22 LTS (`.nvmrc`); small dependency set (no ORM, no auth framework). | CI (`.github/workflows/ci.yml`) runs lint, type-check, tests and build, but no dependency audit. Add `pnpm audit --prod` and Dependabot/Renovate. |
| A07 | Identification and Authentication Failures | Server-side sessions with revocation on logout, disable, role change and password change; staff 12 h / citizen 30 d expiry. bcrypt with a timing-equaliser hash for unknown emails (`src/app/api/auth/login/route.ts`). OTP: 6 digits from `crypto.randomInt`, 5-minute expiry, max 5 attempts, single use, 3 requests per number per 15 min (`src/app/api/auth/otp/*`). Staff accounts cannot log in through OTP and vice versa. Admin-set passwords ≥ 10 chars. | (1) No MFA for staff (recommend TOTP for super admin and dispatchers). (2) No idle timeout or refresh-token rotation (spec mentions refresh tokens). (3) No password-strength check beyond length, no self-service password change. (4) The JWT is also returned in the JSON body; the dashboard should rely on the httpOnly cookie and not store the token in `localStorage`. |
| A08 | Software and Data Integrity Failures | NavoBot webhook: timing-safe API key or HMAC-SHA256 over `timestamp.rawBody` with a 5-minute window (`src/lib/navobot.ts`). SMS webhook: timing-safe shared secret (`src/app/api/integrations/sms/inbound/route.ts`). Uploads validated by magic bytes, ≤ 5 MB (`src/lib/providers/storage.ts`, `src/app/api/media/route.ts`). Migrations run in a transaction and are recorded (`scripts/migrate.ts`). | (1) API-key mode has no replay protection (relies on TLS). (2) Provider-native signatures (e.g. `X-Twilio-Signature`) are not verified; `?secret=` in the query string can end up in proxy logs, so prefer the header. (3) Uploaded images are stored as received: if the client skips compression, EXIF (including home GPS) is kept. Strip metadata server-side. (4) No malware scanning (images only, lower risk). |
| A09 | Security Logging and Monitoring Failures | Append-only-by-convention `audit_logs` with actor, action, entity, before/after, IP, user agent (`src/lib/audit.ts`) for: login, failed login, logout, citizen registration, all incident mutations, walk-in creation, `pii.view` and `pii.reveal`, unit changes, advisories, content CRUD, user admin, analytics export. Notification and SMS logs. Health endpoint. | (1) The app's DB role can UPDATE/DELETE `audit_logs`; use a separate role with INSERT-only rights or ship logs to an external store. (2) No alerting on spikes of `auth.login_failed`, 401s on webhooks, or `pii.reveal`. (3) Reading the audit log itself is not logged. |
| A10 | Server-Side Request Forgery | The server only calls fixed hosts (FCM, Google OAuth, Semaphore, Twilio, Direct Line) and `COPILOT_TOKEN_ENDPOINT`, which comes from the environment, not from users. `announcements.image_url` is stored, never fetched server-side. | None open. Keep any future "fetch this URL" feature behind an allow-list. |

### Additional controls

| Area | Control | Location |
|---|---|---|
| Input validation | zod schemas for every body; PH mobile normaliser; coordinate ranges; length caps | `packages/shared/src/schemas.ts`, `src/lib/content.ts` |
| Secrets | None committed; `.env*` git-ignored; all via env | `.gitignore`, `src/lib/env.ts` |
| Data in exports | Exports omit names and numbers | `src/lib/analytics.ts` `exportRows` |
| Realtime | SSE payload has no PII; events filtered per viewer | migration trigger, `incidents/stream/route.ts` |

### Fix priority (proposed)

1. CSP header; reverse-proxy X-Forwarded-For handling (A05).
2. Redact OTP bodies before storing (A02).
3. Server-side EXIF stripping of stored photos (A08, privacy).
4. Unit-office check on assign; office check on unit create (A01).
5. Per-account login backoff; MFA for super admin (A07).
6. INSERT-only role for audit logs; dependency audit in CI (A09, A06).
7. Background queue for advisory fan-out (A04).

---

## 2. RA 10173 compliance checklist

Legend: ✅ implemented in code, ◐ partly, ✗ not yet (organisational or future work).

| # | Principle / requirement | NavoPulse feature | Evidence in code | Status |
|---|---|---|---|---|
| 1 | Transparency: privacy notice before collection | Registration screen shows the notice; consent checkbox text in both languages | `privacyConsent` strings in `packages/shared/src/i18n.ts`; notice text §3 below | ◐ notice text is a draft for the city's DPO to approve |
| 2 | Consent recorded | Registration refused without `privacyConsent: true`; timestamp stored; `citizen.register` audit entry with `{consent:true}` | `src/app/api/auth/otp/verify/route.ts`, `users.privacy_consent_at` | ✅ |
| 3 | Legitimate purpose / lawful basis for non-account reporters | SMS and NavoBot reporters have no consent screen; processing is justified as emergency response and public service (Sec. 12(d)/(e)) | — | ◐ document the basis in the notice and in the NavoBot greeting |
| 4 | Proportionality / data minimisation | Only mobile, optional name, barangay, language collected; email optional for staff only; reporter name/number optional in NavoBot; list endpoints and SSE carry no PII; exports exclude names/numbers | `listIncidents`, `exportRows`, `notify_incident_change()` | ✅ |
| 5 | Masking for roles that do not need identity | PIO admin and responders see masked name/number by default | `seesReporterIdentity`, `maskName`, `maskMobile` in `src/lib/rbac.ts`, `src/lib/crypto.ts` | ✅ |
| 6 | Logged access to personal data | Viewing an unmasked reporter writes `pii.view`; explicit reveal writes `pii.reveal`; admin can filter `?action=pii.` | `getIncidentDetail`, `revealReporter`, `GET /api/audit` | ✅ |
| 7 | Encryption at rest | AES-256-GCM for `users.mobile_number_enc`, `incidents.reporter_name_enc`, `incidents.reporter_mobile_enc`, `sms_messages.phone_number_enc`; HMAC lookup hashes | `src/lib/crypto.ts`, migration header comment | ✅ (full names of registered users and descriptions are not encrypted: ◐) |
| 8 | Encryption in transit | HSTS in production; secure cookies | `next.config.ts`, `src/lib/auth.ts` | ◐ depends on TLS at the reverse proxy |
| 9 | Access control (need to know) | RBAC + office scope + responder unit scope | `src/lib/rbac.ts`, `scopeSql` | ✅ |
| 10 | Retention and disposal | Proposed periods in §4 | — | ✗ no automated purge job yet; SQL provided in `12-runbook.md` §8 |
| 11 | Data subject rights (access, correction, erasure, portability, objection) | Citizens can view their reports and notifications | `/api/me/*` | ◐ no self-service profile edit, data download or account deletion; handle by written request to the DPO until built |
| 12 | Security of photos | Photos served only through access-checked `GET /api/media/{id}`, never public URLs | `src/app/api/media/[id]/route.ts` | ✅ (◐ EXIF not stripped server-side) |
| 13 | Breach management | Audit and SMS logs support investigation | — | ✗ organisational: incident response plan, NPC notification within 72 hours of knowledge (NPC Circular 16-03) |
| 14 | DPO and registration | — | — | ✗ city designates DPO; register the system with NPC if thresholds apply |
| 15 | Privacy Impact Assessment | This document is an input | — | ✗ conduct PIA with the city DPO before go-live |
| 16 | Third-party processors | SMS (Semaphore/Twilio), FCM (Google), Microsoft 365 (Copilot Studio/SharePoint) | `src/lib/providers/*` | ✗ data sharing / outsourcing agreements; check cross-border transfer terms |
| 17 | AI chat data | Bot instructions forbid collecting passwords, OTPs, IDs; name/number optional | `05-navobot-copilot-studio.md` §3 | ◐ set Copilot Studio transcript retention to the minimum |

---

## 3. Privacy Notice (draft for DPO review)

> Draft prepared for the capstone. The City Government of Navotas, through its Data Protection Officer, must review, complete the bracketed fields, and approve it before public use.

### 3.1 English

**NavoPulse Privacy Notice**

The City Government of Navotas ("the City", "we") operates NavoPulse to receive emergency and community reports, send advisories, and answer questions about city services. We respect your privacy and process personal data according to the Data Privacy Act of 2012 (Republic Act No. 10173).

**What we collect**
- Your mobile number (to sign you in by one-time code and to send you updates and alerts).
- Your name, barangay and preferred language, if you give them.
- Your reports: type, description, photos, the location of the incident, the number of people affected, and the time.
- If you report by SMS or through NavoBot: your mobile number and, if you give it, your name.
- Technical data: device notification token, IP address and browser type of sign-ins, and records of your use of the service needed for security.

**Why we use it**
- To respond to emergencies and act on community reports, including sending the right team to the location you report.
- To update you on the status of your reports and ask for your rating of our service.
- To send flood, weather and other public advisories to your barangay.
- To prepare statistics that do not identify you (for example, number of reports per barangay).
- To keep the service secure and to prevent misuse.

**Who can see it**
- Only authorised City personnel who need it for their work (DRRMO, TMO, PIO, assigned field teams). Teams that do not need your identity see it masked, and every view of your contact details is logged.
- Service providers that deliver SMS, push notifications and the NavoBot assistant on our behalf, under agreements that require them to protect your data.
- Government agencies when required by law or in an emergency to protect life.
- We do not sell your data or use it for political or commercial messages.

**How we protect it**
Your mobile number and the names of reporters are encrypted in our database. Access is limited by role and recorded in an audit log. Data is sent over encrypted connections.

**How long we keep it**
[Insert approved retention periods, see the City's records disposition schedule.] Afterwards, data is deleted or made anonymous.

**Your rights**
You have the right to be informed, to access, to correct, to object, to erasure or blocking, to data portability, and to file a complaint with the National Privacy Commission. To use these rights, contact our Data Protection Officer: [Name], [Office address], [email], [phone].

**Emergencies**
In a life-threatening emergency, we may process your data without further consent to protect your life and the lives of others, as allowed by law.

By ticking "I agree", you confirm that you have read this notice and you consent to the processing of your personal data for the purposes above.

### 3.2 Filipino

**Paunawa sa Privacy ng NavoPulse**

Ang Pamahalaang Lungsod ng Navotas ("ang Lungsod", "kami") ang nagpapatakbo ng NavoPulse para tumanggap ng mga ulat ng emergency at problema sa komunidad, magpadala ng mga abiso, at sumagot sa mga tanong tungkol sa serbisyo ng lungsod. Iginagalang namin ang iyong privacy at pinoproseso namin ang personal na datos ayon sa Data Privacy Act of 2012 (Republic Act Blg. 10173).

**Anong datos ang kinokolekta namin**
- Ang iyong mobile number (para makapag-sign in gamit ang one-time code at para mapadalhan ka ng update at abiso).
- Ang iyong pangalan, barangay at piniling wika, kung ibibigay mo.
- Ang iyong mga ulat: uri, paglalarawan, mga larawan, lokasyon ng insidente, bilang ng apektado, at oras.
- Kung nag-ulat ka sa SMS o kay NavoBot: ang iyong mobile number at, kung ibibigay mo, ang iyong pangalan.
- Teknikal na datos: token ng notification ng device, IP address at uri ng browser sa pag-sign in, at mga talaan ng paggamit na kailangan para sa seguridad.

**Bakit namin ito ginagamit**
- Para tumugon sa emergency at aksyunan ang mga ulat, kasama ang pagpapadala ng tamang team sa lokasyong iniulat mo.
- Para i-update ka sa status ng iyong ulat at hingin ang iyong rating sa aming serbisyo.
- Para magpadala ng abiso tungkol sa baha, panahon at iba pang pampublikong babala sa iyong barangay.
- Para gumawa ng mga estadistika na hindi ka nakikilala (halimbawa, bilang ng ulat bawat barangay).
- Para mapanatiling ligtas ang serbisyo at maiwasan ang maling paggamit.

**Sino ang makakakita nito**
- Mga awtorisadong kawani lamang ng Lungsod na nangangailangan nito sa kanilang trabaho (DRRMO, TMO, PIO, at itinalagang field team). Ang mga team na hindi kailangang makilala ka ay nakakakita lamang ng nakatagong (masked) bersyon, at bawat pagtingin sa iyong contact details ay naitatala.
- Mga service provider na naghahatid ng SMS, push notification at ng NavoBot para sa amin, sa ilalim ng kasunduang nag-oobliga sa kanila na protektahan ang iyong datos.
- Mga ahensya ng pamahalaan kung hinihingi ng batas o sa emergency para iligtas ang buhay.
- Hindi namin ibinebenta ang iyong datos at hindi ito ginagamit sa pulitikal o komersyal na mensahe.

**Paano namin ito pinoprotektahan**
Naka-encrypt sa aming database ang iyong mobile number at ang pangalan ng mga nag-uulat. Limitado ayon sa tungkulin ang access at naitatala sa audit log. Ipinapadala ang datos sa encrypted na koneksyon.

**Gaano katagal namin ito itatago**
[Ilagay ang aprubadong panahon ng pagtatago ayon sa records disposition schedule ng Lungsod.] Pagkatapos nito, buburahin o gagawing anonymous ang datos.

**Ang iyong mga karapatan**
May karapatan kang malaman, ma-access, maitama, tumutol, ipabura o ipa-block, kumuha ng kopya ng iyong datos, at magreklamo sa National Privacy Commission. Para gamitin ang mga karapatang ito, makipag-ugnayan sa aming Data Protection Officer: [Pangalan], [Address ng opisina], [email], [telepono].

**Emergency**
Sa emergency na may banta sa buhay, maaari naming iproseso ang iyong datos nang walang dagdag na pahintulot para protektahan ang iyong buhay at ng iba, ayon sa pinapayagan ng batas.

Sa pag-tick sa "Pumapayag ako", kinukumpirma mong nabasa mo ang paunawang ito at pumapayag ka sa pagproseso ng iyong personal na datos para sa mga layuning nakasaad sa itaas.

---

## 4. Proposed retention periods

To be confirmed with the City Legal Office, the DPO, and the National Archives of the Philippines (NAP) General Records Disposition Schedule for LGUs. "Anonymise" means: clear `reporter_name_enc`, `reporter_mobile_enc`, `reporter_mobile_hash`, set `reporter_id` to NULL, and keep the non-identifying record for statistics.

| Data | Table(s) | Proposed retention | Then |
|---|---|---|---|
| OTP codes | `otp_codes` | 24 hours after expiry | Delete |
| OTP SMS bodies | `sms_messages` (outbound OTP), `notifications` kind `otp` | 7 days | Delete |
| Sessions | `sessions` | 30 days after expiry or revocation | Delete |
| Device tokens | `device_tokens` | Until unregistered by FCM, or not seen for 180 days | Delete |
| Emergency incidents (EMR) with history, notes | `incidents`, `incident_status_history`, `incident_notes` | 5 years after resolution | Anonymise; keep for disaster-risk statistics |
| Civic and traffic incidents (CIV/TRF) | same | 3 years after resolution (longer if tied to an enforcement case) | Anonymise |
| Report photos | `incident_media` type `report` + files | 1 year after resolution, unless used as evidence in an enforcement case | Delete file and row |
| Resolution photos | `incident_media` type `resolution` | Same as the incident | Delete with the incident or keep if no person is identifiable |
| Inbound/outbound SMS (non-OTP) | `sms_messages` | 1 year | Delete |
| Notification log | `notifications` | 1 year | Delete |
| Advisories | `advisories` | Permanent (public record) | — |
| Feedback | `feedback` | 3 years | Anonymise (`citizen_id` NULL) |
| NavoBot inquiries | `inquiries` | 1 year (or with the linked incident) | Delete or anonymise |
| Copilot Studio transcripts | Dataverse (Microsoft 365) | 30 days (configure in Copilot Studio/Power Platform) | Purged by the platform |
| Inactive citizen accounts | `users` role citizen | Notify after 2 years without login; anonymise at 3 years | Anonymise user and unlink reports |
| Staff accounts | `users` staff | Disable on separation; keep 5 years for accountability | Anonymise |
| Audit logs | `audit_logs` | 5 years | Delete |
| Backups | pg_dump files | 35 days rolling + monthly for 12 months | Secure deletion |

The purge job is not built yet. The SQL to run it on a schedule is in `12-runbook.md` §8.
