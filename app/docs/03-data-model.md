# NavoPulse Data Model

Source of truth: `apps/web/db/migrations/001_init.sql` (PostgreSQL 15+/16 with PostGIS 3, `pgcrypto`, `citext`). The migration runner (`apps/web/scripts/migrate.ts`) also creates `schema_migrations(name, applied_at)` to record applied files.

All geometry is WGS84 (SRID 4326). Primary keys are `uuid DEFAULT gen_random_uuid()` except `audit_logs.id` (`bigserial`), `control_sequences` (composite) and `settings` (`key`).

Mermaid type names cannot contain parentheses, so `geometry(Point, 4326)` is written `geometry_Point`, `uuid[]` is `uuid_array`, and so on.

## 1. Reference and identity

```mermaid
erDiagram
  barangays {
    uuid id PK
    text name UK
    smallint district "CHECK 1 or 2"
    geometry_MultiPolygon boundary "GiST index"
    geometry_Point centroid "NOT NULL"
    text hotline
    text address
    jsonb officials "default []"
    integer population
    timestamptz created_at
    timestamptz updated_at
  }
  incident_categories {
    uuid id PK
    text code UK "e.g. EMR_FLOOD"
    text name_en
    text name_fil
    text module "emergency | civic | traffic"
    text default_office "DRRMO | TMO | PIO"
    text priority "low | normal | high | critical"
    text color
    integer sort_order
    boolean is_active
  }
  response_units {
    uuid id PK
    text name UK
    text office "DRRMO | TMO"
    text type
    text contact
    geometry_Point current_location
    boolean is_available
    timestamptz created_at
  }
  users {
    uuid id PK
    text role "6 roles"
    text full_name
    citext email UK
    text mobile_number_enc "AES-256-GCM"
    text mobile_hash UK "HMAC lookup"
    text password_hash "bcrypt, staff"
    uuid barangay_id FK
    uuid unit_id FK "responders"
    text preferred_language "en | fil"
    boolean is_verified
    boolean is_active
    timestamptz privacy_consent_at "RA 10173"
    timestamptz last_login_at
    timestamptz created_at
  }
  sessions {
    uuid id PK
    uuid user_id FK "ON DELETE CASCADE"
    timestamptz created_at
    timestamptz expires_at
    timestamptz revoked_at
    inet ip
    text user_agent
  }
  otp_codes {
    uuid id PK
    text mobile_hash "no FK"
    text code_hash "bcrypt"
    smallint attempts
    timestamptz expires_at
    timestamptz consumed_at
    timestamptz created_at
  }
  device_tokens {
    uuid id PK
    uuid user_id FK "ON DELETE CASCADE"
    text platform "android | ios | web"
    text token UK
    timestamptz created_at
    timestamptz last_seen_at
  }
  settings {
    text key PK
    jsonb value
    uuid updated_by FK
    timestamptz updated_at
  }

  barangays ||--o{ users : "home barangay"
  response_units ||--o{ users : "responder unit"
  users ||--o{ sessions : has
  users ||--o{ device_tokens : registers
  users ||--o{ settings : "updated_by"
```

## 2. Incidents and inquiries

```mermaid
erDiagram
  control_sequences {
    text code PK "EMR | CIV | TRF | INQ"
    text date_key PK "YYYYMMDD Manila"
    integer last_value
  }
  inquiries {
    uuid id PK
    text control_number UK "NVP-INQ-..."
    text channel "default navobot"
    uuid citizen_id FK
    text conversation_id
    text topic
    text transcript_ref
    text status "open | answered | converted | closed"
    timestamptz created_at
  }
  incidents {
    uuid id PK
    text control_number UK
    uuid client_id UK "idempotency key"
    uuid category_id FK "NOT NULL"
    text module "emergency | civic | traffic"
    uuid reporter_id FK
    text reporter_name_enc "AES-256-GCM"
    text reporter_mobile_enc "AES-256-GCM"
    text reporter_mobile_hash "HMAC lookup"
    text source "app | sms | navobot | walk_in"
    text description
    geometry_Point location "NOT NULL, GiST"
    real location_accuracy_m
    text location_source "device | exif | manual | sms | navobot | barangay_centroid"
    text address_text
    uuid barangay_id FK "filled by trigger"
    integer people_affected "non-negative"
    text status "7 statuses"
    text priority "low | normal | high | critical"
    uuid assigned_unit_id FK
    uuid duplicate_of_id FK "self reference, never own id"
    uuid inquiry_id FK
    text resolution_note
    timestamptz observed_at "EXIF time"
    timestamptz created_at
    timestamptz updated_at "trigger"
    timestamptz verified_at
    timestamptz assigned_at
    timestamptz resolved_at
  }
  incident_media {
    uuid id PK
    uuid incident_id FK "nullable until linked"
    text storage_key
    text mime_type
    integer size_bytes
    text type "report | resolution"
    double exif_lat
    double exif_lng
    timestamptz exif_taken_at
    uuid uploaded_by FK
    timestamptz created_at
  }
  incident_status_history {
    uuid id PK
    uuid incident_id FK "CASCADE"
    text from_status
    text to_status
    uuid changed_by FK
    text note
    timestamptz created_at
  }
  incident_notes {
    uuid id PK
    uuid incident_id FK "CASCADE"
    uuid author_id FK "NOT NULL"
    text body
    timestamptz created_at
  }
  feedback {
    uuid id PK
    uuid incident_id FK,UK "CASCADE"
    uuid inquiry_id FK,UK "CASCADE"
    uuid citizen_id FK
    smallint rating "1..5"
    text comment
    timestamptz created_at
  }
  incident_categories {
    uuid id PK
  }
  users {
    uuid id PK
  }
  barangays {
    uuid id PK
  }
  response_units {
    uuid id PK
  }

  incident_categories ||--o{ incidents : classifies
  users |o--o{ incidents : reports
  barangays |o--o{ incidents : "located in"
  response_units |o--o{ incidents : "assigned to"
  incidents |o--o{ incidents : "duplicate_of"
  inquiries |o--o{ incidents : "became"
  users |o--o{ inquiries : "citizen"
  incidents |o--o{ incident_media : has
  users |o--o{ incident_media : uploads
  incidents ||--o{ incident_status_history : timeline
  users |o--o{ incident_status_history : "changed_by"
  incidents ||--o{ incident_notes : "internal notes"
  users ||--o{ incident_notes : writes
  incidents |o--o| feedback : rated
  inquiries |o--o| feedback : rated
  users |o--o{ feedback : gives
```

## 3. Alerts, messaging and audit

```mermaid
erDiagram
  advisories {
    uuid id PK
    text title
    text body_en
    text body_fil
    text severity "info | advisory | warning | critical"
    uuid_array target_barangay_ids "empty = city-wide, no FK"
    text_array channels "push, sms"
    uuid sent_by FK
    timestamptz sent_at
    timestamptz expires_at
    integer recipients_count
  }
  notifications {
    uuid id PK
    uuid user_id FK "SET NULL"
    text channel "push | sms | in_app"
    text kind "status_change, advisory, otp, feedback_request..."
    jsonb payload
    text status "queued | sent | delivered | failed | skipped"
    text error
    uuid incident_id FK "SET NULL"
    uuid advisory_id FK "SET NULL"
    timestamptz read_at
    timestamptz created_at
    timestamptz sent_at
    timestamptz delivered_at
  }
  sms_messages {
    uuid id PK
    text direction "inbound | outbound"
    text phone_number_enc "AES-256-GCM"
    text phone_hash "HMAC lookup"
    text body
    uuid parsed_incident_id FK "SET NULL"
    text parse_error
    text provider
    text provider_message_id "unique with provider"
    text status
    timestamptz created_at
  }
  audit_logs {
    bigserial id PK
    uuid actor_id FK
    text action "incident.status_change, pii.view..."
    text entity
    text entity_id
    jsonb before
    jsonb after
    inet ip
    text user_agent
    timestamptz created_at
  }
  users {
    uuid id PK
  }
  incidents {
    uuid id PK
  }

  users |o--o{ advisories : sends
  users |o--o{ notifications : receives
  incidents |o--o{ notifications : about
  advisories |o--o{ notifications : about
  incidents |o--o{ sms_messages : "parsed into / about"
  users |o--o{ audit_logs : "actor"
```

## 4. Content (Angat Navotas, Transport Hub)

```mermaid
erDiagram
  announcements {
    uuid id PK
    text title_en
    text title_fil
    text body_en
    text body_fil
    text image_url
    boolean is_published
    timestamptz published_at
    uuid created_by FK
    timestamptz created_at
  }
  events {
    uuid id PK
    text title
    text description
    text venue
    uuid barangay_id FK
    geometry_Point location
    timestamptz starts_at
    timestamptz ends_at
    boolean is_published
    timestamptz created_at
  }
  businesses {
    uuid id PK
    text name
    text category
    text description
    text address
    text contact
    uuid barangay_id FK
    geometry_Point location
    boolean is_published
    timestamptz created_at
  }
  transit_routes {
    uuid id PK
    text code UK
    text name
    text mode "jeepney | bus | tricycle | pedicab | ferry | uv_express"
    text origin
    text destination
    numeric fare_min "8,2"
    text fare_notes
    text description
    geometry_LineString path
    boolean is_active
  }
  transit_stops {
    uuid id PK
    uuid route_id FK "CASCADE"
    text name
    text kind "terminal | stop"
    text address
    geometry_Point location "NOT NULL"
  }
  users {
    uuid id PK
  }
  barangays {
    uuid id PK
  }

  users |o--o{ announcements : "created_by"
  barangays |o--o{ events : hosts
  barangays |o--o{ businesses : "located in"
  transit_routes |o--o{ transit_stops : has
```

## 5. Differences from the spec's starting model

| Spec | Implemented | Why |
|---|---|---|
| `users.mobile_number` | `mobile_number_enc` + `mobile_hash` | Encryption at rest with lookup by keyed hash (RA 10173) |
| `incidents.location geography(Point)` | `geometry(Point, 4326)`; casts to `::geography` for metre distances | GiST on geometry serves both bbox and `ST_Contains`; geography cast only where distance in metres is needed |
| `incident_media.url` | `storage_key` + `mime_type` + `size_bytes`; served by `GET /api/media/{id}` with access checks | Photos are never public URLs |
| — | `incidents.client_id` (unique) | Idempotent creation from offline queue, SMS and NavoBot |
| — | `incidents.module`, `location_source`, `location_accuracy_m`, `observed_at`, `assigned_at`, `inquiry_id`, `resolution_note` | Workflow, analytics and GPS-precision testing |
| — | `reporter_name_enc`, `reporter_mobile_enc`, `reporter_mobile_hash` | Reporters without accounts (SMS, NavoBot, walk-in) |
| — | `sessions`, `otp_codes`, `control_sequences`, `incident_notes`, `settings` | Auth, control numbers, internal notes, config |
| `advisories.target` / `channels` | `target_barangay_ids uuid[]` (empty = all), `channels text[]` | Simple array filters |
| `notifications` | Adds `kind`, `error`, `incident_id`, `advisory_id`, `read_at` | Notification log and in-app inbox |
| `sms_messages` | Adds `phone_hash`, `parse_error`, `provider` | Dedup and troubleshooting |

## 6. PostGIS columns and indexes

| Table.column | Type | Index | Used by |
|---|---|---|---|
| `barangays.boundary` | `geometry(MultiPolygon,4326)` | `barangays_boundary_gix` GiST | Trigger `ST_Contains` lookup; map overlay (`ST_AsGeoJSON(boundary, 6)`) |
| `barangays.centroid` | `geometry(Point,4326)` NOT NULL | none (18 rows) | Nearest-centroid fallback (`ST_DWithin` 1.5 km, `<->` ordering); NavoBot barangay-only tickets |
| `incidents.location` | `geometry(Point,4326)` NOT NULL | `incidents_location_gix` GiST | Map feed (`ST_X/ST_Y`), possible-duplicate search (`ST_DWithin(::geography, 150)`), heatmap |
| `response_units.current_location` | `geometry(Point,4326)` | none | Units layer |
| `events.location`, `businesses.location`, `transit_stops.location` | `geometry(Point,4326)` | none | Map pins in PWA |
| `transit_routes.path` | `geometry(LineString,4326)` | none | Route lines (`ST_AsGeoJSON(path, 6)`) |

Points are built as `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`; note longitude first.

Seeded boundaries are **generated**: `ST_VoronoiPolygons` over the 18 approximate centroids, clipped to a rough city outline (`scripts/seed.ts`). They are for demonstration only. Replace them with official PSA/NAMRIA boundaries before production. (`seed-data.ts` mentions `scripts/import-boundaries.ts`, but that script does not exist yet.)

Non-spatial indexes on `incidents`: `status`, `created_at DESC`, `(module, status)`, `barangay_id`, `reporter_id`, partial `assigned_unit_id WHERE NOT NULL`. Others: `sessions(user_id)`, `otp_codes(mobile_hash, created_at DESC)`, `incident_media(incident_id)`, `incident_status_history(incident_id, created_at)`, `advisories(sent_at DESC)`, `notifications(user_id, created_at DESC)`, `notifications(created_at DESC)`, unique partial `sms_messages(provider, provider_message_id) WHERE provider_message_id IS NOT NULL`, `audit_logs(created_at DESC)`, `audit_logs(entity, entity_id)`.

## 7. Encryption: `_enc` and `_hash` columns

Implemented in `apps/web/src/lib/crypto.ts`, key from `DATA_ENCRYPTION_KEY` (32 bytes, base64).

| Column | Content |
|---|---|
| `users.mobile_number_enc`, `incidents.reporter_name_enc`, `incidents.reporter_mobile_enc`, `sms_messages.phone_number_enc` | AES-256-GCM ciphertext, format `v1.<iv b64url>.<auth tag b64url>.<ciphertext b64url>`, random 96-bit IV per value |
| `users.mobile_hash`, `incidents.reporter_mobile_hash`, `sms_messages.phone_hash`, `otp_codes.mobile_hash` | `HMAC-SHA256(key, "lookup:" + E.164 number)` hex; lets the app find a user by number, link SMS/NavoBot reports to accounts, and deduplicate, without storing plaintext |
| `otp_codes.code_hash`, `users.password_hash` | bcrypt (cost 8 for OTP, 12 for staff passwords set by admin, 10 in seed) |

Notes and limits:
- The same key encrypts and derives lookup hashes. Rotating it needs a re-encryption script (not built); see `12-runbook.md`.
- `users.full_name`, `incidents.description` and `address_text` are **not encrypted** (they are needed for search/display). Descriptions can contain personal data written by the citizen; treat database backups as confidential.
- Seeded walk-in/SMS reporters get `reporter_mobile_enc` but no `reporter_mobile_hash` (seed shortcut; real code paths set both).

## 8. Triggers and functions

| Trigger | Table / timing | Function | Behaviour |
|---|---|---|---|
| `incidents_notify` | `incidents` AFTER INSERT OR UPDATE, per row | `notify_incident_change()` | `pg_notify('incidents', {op, id, module, status, priority, controlNumber})`. Consumed by `src/lib/realtime.ts` → SSE. Payload contains no personal data. |
| `incidents_touch` | `incidents` BEFORE UPDATE | `touch_updated_at()` | Sets `updated_at = now()` |
| `incidents_barangay` | `incidents` BEFORE INSERT | `incidents_fill_barangay()` | When `barangay_id` is NULL: first barangay whose boundary `ST_Contains` the point; else nearest centroid within 1.5 km (points on the bay); else stays NULL ("Unknown" in analytics) |

## 9. Control numbers

`control_sequences(code, date_key, last_value)` holds one counter per prefix per Manila date. `nextControlNumber()` (`src/lib/controlNumbers.ts`) runs an `INSERT … ON CONFLICT DO UPDATE SET last_value = last_value + 1 RETURNING last_value` inside the incident transaction, which row-locks the counter so concurrent reports get distinct numbers. Format and parser: `packages/shared/src/controlNumber.ts` (`/^NVP-(EMR|CIV|TRF|INQ)-(\d{8})-(\d{6})$/`). Sequences above 999,999 per prefix per day throw an error.

## 10. Status workflow

```mermaid
stateDiagram-v2
  [*] --> submitted
  submitted --> verified
  submitted --> assigned : assign action
  submitted --> rejected
  submitted --> duplicate : merge action
  verified --> assigned : assign action
  verified --> in_progress
  verified --> resolved : resolve action
  verified --> rejected
  verified --> duplicate : merge action
  assigned --> in_progress
  assigned --> resolved : resolve action
  assigned --> verified : status (unit stays linked)
  assigned --> rejected
  in_progress --> resolved : resolve action
  in_progress --> assigned
  resolved --> [*]
  rejected --> [*]
  duplicate --> [*]
```

Defined in `STATUS_TRANSITIONS` (`packages/shared/src/constants.ts`). `assigned`, `duplicate` and `resolved` can only be reached through their dedicated endpoints (assign, merge, resolve) so the unit, original case and resolution note are always recorded. Each transition writes `incident_status_history` and the matching timestamp (`verified_at`, `assigned_at`, `resolved_at`, first time only). Note: `constants.ts` mentions reopening by a super admin, but no reopen path is implemented.
