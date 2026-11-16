-- NavoPulse initial schema
-- PostgreSQL 15+ with PostGIS 3. All geometry is WGS84 (SRID 4326).
-- Personal data columns ending in _enc are AES-256-GCM ciphertext written by
-- the application (src/lib/crypto.ts); *_hash columns are keyed HMAC-SHA256
-- digests used for lookups without storing the plaintext (RA 10173).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- reference
CREATE TABLE barangays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  district      smallint NOT NULL CHECK (district IN (1, 2)),
  boundary      geometry(MultiPolygon, 4326),
  centroid      geometry(Point, 4326) NOT NULL,
  hotline       text,
  address       text,
  officials     jsonb NOT NULL DEFAULT '[]'::jsonb,
  population    integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX barangays_boundary_gix ON barangays USING gist (boundary);

CREATE TABLE incident_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  name_en         text NOT NULL,
  name_fil        text NOT NULL,
  module          text NOT NULL CHECK (module IN ('emergency', 'civic', 'traffic')),
  default_office  text NOT NULL CHECK (default_office IN ('DRRMO', 'TMO', 'PIO')),
  priority        text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  color           text NOT NULL DEFAULT '#64748b',
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true
);

CREATE TABLE response_units (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  office            text NOT NULL CHECK (office IN ('DRRMO', 'TMO')),
  type              text NOT NULL,           -- rescue boat, ambulance, enforcer team...
  contact           text,
  current_location  geometry(Point, 4326),
  is_available      boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- identity
CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role                text NOT NULL CHECK (role IN ('citizen', 'drrmo_dispatcher', 'tmo_officer', 'field_responder', 'pio_admin', 'super_admin')),
  full_name           text,
  email               citext UNIQUE,
  mobile_number_enc   text,
  mobile_hash         text UNIQUE,
  password_hash       text,
  barangay_id         uuid REFERENCES barangays(id),
  unit_id             uuid REFERENCES response_units(id),
  preferred_language  text NOT NULL DEFAULT 'fil' CHECK (preferred_language IN ('en', 'fil')),
  is_verified         boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  privacy_consent_at  timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR mobile_hash IS NOT NULL)
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  ip          inet,
  user_agent  text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE otp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_hash  text NOT NULL,
  code_hash    text NOT NULL,
  attempts     smallint NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_mobile_idx ON otp_codes (mobile_hash, created_at DESC);

CREATE TABLE device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  token       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- incidents
-- One row per (module code, Manila date); incremented atomically.
CREATE TABLE control_sequences (
  code        text NOT NULL,
  date_key    text NOT NULL,
  last_value  integer NOT NULL,
  PRIMARY KEY (code, date_key)
);

CREATE TABLE inquiries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_number   text NOT NULL UNIQUE,
  channel          text NOT NULL DEFAULT 'navobot',
  citizen_id       uuid REFERENCES users(id),
  conversation_id  text,
  topic            text NOT NULL,
  transcript_ref   text,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'converted', 'closed')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_number       text NOT NULL UNIQUE,
  client_id            uuid UNIQUE,            -- idempotency key from the device
  category_id          uuid NOT NULL REFERENCES incident_categories(id),
  module               text NOT NULL CHECK (module IN ('emergency', 'civic', 'traffic')),
  reporter_id          uuid REFERENCES users(id),
  reporter_name_enc    text,                   -- for SMS / NavoBot / walk-in reporters without accounts
  reporter_mobile_enc  text,
  reporter_mobile_hash text,
  source               text NOT NULL CHECK (source IN ('app', 'sms', 'navobot', 'walk_in')),
  description          text NOT NULL DEFAULT '',
  location             geometry(Point, 4326) NOT NULL,
  location_accuracy_m  real,
  location_source      text NOT NULL DEFAULT 'device' CHECK (location_source IN ('device', 'exif', 'manual', 'sms', 'navobot', 'barangay_centroid')),
  address_text         text,
  barangay_id          uuid REFERENCES barangays(id),
  people_affected      integer CHECK (people_affected >= 0),
  status               text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected', 'duplicate')),
  priority             text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  assigned_unit_id     uuid REFERENCES response_units(id),
  duplicate_of_id      uuid REFERENCES incidents(id),
  inquiry_id           uuid REFERENCES inquiries(id),
  resolution_note      text,
  observed_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  verified_at          timestamptz,
  assigned_at          timestamptz,
  resolved_at          timestamptz,
  CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id)
);
CREATE INDEX incidents_location_gix ON incidents USING gist (location);
CREATE INDEX incidents_status_idx ON incidents (status);
CREATE INDEX incidents_created_idx ON incidents (created_at DESC);
CREATE INDEX incidents_module_status_idx ON incidents (module, status);
CREATE INDEX incidents_barangay_idx ON incidents (barangay_id);
CREATE INDEX incidents_reporter_idx ON incidents (reporter_id);
CREATE INDEX incidents_unit_idx ON incidents (assigned_unit_id) WHERE assigned_unit_id IS NOT NULL;

CREATE TABLE incident_media (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id    uuid REFERENCES incidents(id) ON DELETE CASCADE,
  storage_key    text NOT NULL,
  mime_type      text NOT NULL,
  size_bytes     integer NOT NULL,
  type           text NOT NULL CHECK (type IN ('report', 'resolution')),
  exif_lat       double precision,
  exif_lng       double precision,
  exif_taken_at  timestamptz,
  uploaded_by    uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_media_incident_idx ON incident_media (incident_id);

CREATE TABLE incident_status_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  from_status  text,
  to_status    text NOT NULL,
  changed_by   uuid REFERENCES users(id),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_status_history_incident_idx ON incident_status_history (incident_id, created_at);

CREATE TABLE incident_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES users(id),
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
  inquiry_id   uuid UNIQUE REFERENCES inquiries(id) ON DELETE CASCADE,
  citizen_id   uuid REFERENCES users(id),
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (incident_id IS NOT NULL OR inquiry_id IS NOT NULL)
);

-- ---------------------------------------------------------------- alerts
CREATE TABLE advisories (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text NOT NULL,
  body_en              text NOT NULL,
  body_fil             text NOT NULL,
  severity             text NOT NULL CHECK (severity IN ('info', 'advisory', 'warning', 'critical')),
  target_barangay_ids  uuid[] NOT NULL DEFAULT '{}',   -- empty = city-wide
  channels             text[] NOT NULL DEFAULT '{push}',
  sent_by              uuid REFERENCES users(id),
  sent_at              timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  recipients_count     integer NOT NULL DEFAULT 0
);
CREATE INDEX advisories_sent_idx ON advisories (sent_at DESC);

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  channel       text NOT NULL CHECK (channel IN ('push', 'sms', 'in_app')),
  kind          text NOT NULL,          -- status_change, advisory, otp, feedback_request...
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  error         text,
  incident_id   uuid REFERENCES incidents(id) ON DELETE SET NULL,
  advisory_id   uuid REFERENCES advisories(id) ON DELETE SET NULL,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  delivered_at  timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_created_idx ON notifications (created_at DESC);

CREATE TABLE sms_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction            text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number_enc     text NOT NULL,
  phone_hash           text NOT NULL,
  body                 text NOT NULL,
  parsed_incident_id   uuid REFERENCES incidents(id) ON DELETE SET NULL,
  parse_error          text,
  provider             text NOT NULL,
  provider_message_id  text,
  status               text NOT NULL DEFAULT 'received',
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sms_messages_provider_uidx ON sms_messages (provider, provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ---------------------------------------------------------------- content
CREATE TABLE announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en      text NOT NULL,
  title_fil     text NOT NULL,
  body_en       text NOT NULL,
  body_fil      text NOT NULL,
  image_url     text,
  is_published  boolean NOT NULL DEFAULT true,
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  venue         text,
  barangay_id   uuid REFERENCES barangays(id),
  location      geometry(Point, 4326),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz,
  is_published  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE businesses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  category      text NOT NULL,
  description   text NOT NULL DEFAULT '',
  address       text,
  contact       text,
  barangay_id   uuid REFERENCES barangays(id),
  location      geometry(Point, 4326),
  is_published  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transit_routes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  mode          text NOT NULL CHECK (mode IN ('jeepney', 'bus', 'tricycle', 'pedicab', 'ferry', 'uv_express')),
  origin        text NOT NULL,
  destination   text NOT NULL,
  fare_min      numeric(8, 2),
  fare_notes    text,
  description   text NOT NULL DEFAULT '',
  path          geometry(LineString, 4326),
  is_active     boolean NOT NULL DEFAULT true
);

CREATE TABLE transit_stops (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   uuid REFERENCES transit_routes(id) ON DELETE CASCADE,
  name       text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('terminal', 'stop')),
  address    text,
  location   geometry(Point, 4326) NOT NULL
);

-- ---------------------------------------------------------------- audit
CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,            -- e.g. incident.status_change, pii.view, user.create
  entity      text NOT NULL,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- realtime
-- Every insert/update on incidents is broadcast on the "incidents" channel;
-- the dashboard's SSE endpoint LISTENs and pushes it to open browsers.
CREATE FUNCTION notify_incident_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('incidents', json_build_object(
    'op', TG_OP,
    'id', NEW.id,
    'module', NEW.module,
    'status', NEW.status,
    'priority', NEW.priority,
    'controlNumber', NEW.control_number
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incidents_notify
AFTER INSERT OR UPDATE ON incidents
FOR EACH ROW EXECUTE FUNCTION notify_incident_change();

CREATE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incidents_touch BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Fill barangay_id from the point when the client did not send one.
CREATE FUNCTION incidents_fill_barangay() RETURNS trigger AS $$
BEGIN
  IF NEW.barangay_id IS NULL THEN
    SELECT b.id INTO NEW.barangay_id
    FROM barangays b
    WHERE b.boundary IS NOT NULL AND ST_Contains(b.boundary, NEW.location)
    LIMIT 1;
    IF NEW.barangay_id IS NULL THEN
      -- Outside every polygon (e.g. on the bay): nearest centroid within 1.5 km.
      SELECT b.id INTO NEW.barangay_id
      FROM barangays b
      WHERE ST_DWithin(b.centroid::geography, NEW.location::geography, 1500)
      ORDER BY b.centroid <-> NEW.location
      LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER incidents_barangay BEFORE INSERT ON incidents FOR EACH ROW EXECUTE FUNCTION incidents_fill_barangay();
