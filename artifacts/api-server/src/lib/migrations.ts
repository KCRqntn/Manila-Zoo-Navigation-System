import { pool } from "@workspace/db";
import { logger } from "./logger";
import { parkSeedSql } from "./parkSeed";

/**
 * Reproducible schema changes. Each migration runs once, in order, inside a transaction, and is
 * recorded in schema_migrations. Never edit a migration that has run; add a new one instead.
 * Runs at API startup (see index.ts) and can be run alone: `pnpm --filter @workspace/api-server migrate:apply`.
 */
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "2026-10-21-01-security-audit-datasets",
    sql: `
-- ─── Row Level Security ───────────────────────────────────────────────────────
-- The website only reaches data through this API, which connects as the table owner and bypasses
-- RLS. Turning RLS on with no policies blocks direct access with the public (anon) Supabase key.
DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─── Audit log (append-only) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  actor_id    text,
  actor_email text,
  actor_role  text,
  action      text NOT NULL,
  resource    text NOT NULL,
  record_id   text,
  result      text NOT NULL CHECK (result IN ('success', 'failure')),
  before      jsonb,
  after       jsonb,
  context     jsonb,
  prev_hash   text,
  hash        text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs (resource);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_email);
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs;
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── Zoo updates ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zoo_updates (
  id           serial PRIMARY KEY,
  title        text NOT NULL UNIQUE CHECK (length(trim(title)) > 0),
  description  text NOT NULL CHECK (length(trim(description)) > 0),
  category     text NOT NULL DEFAULT 'general',
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text,
  updated_by   text
);
CREATE INDEX IF NOT EXISTS zoo_updates_status_idx ON zoo_updates (status, published_at DESC);
ALTER TABLE zoo_updates ENABLE ROW LEVEL SECURITY;

-- ─── Ticket prices (with verification) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_prices (
  id               serial PRIMARY KEY,
  category         text NOT NULL CHECK (length(trim(category)) > 0),
  visitor_type     text NOT NULL CHECK (length(trim(visitor_type)) > 0),
  price            numeric(10, 2) CHECK (price IS NULL OR price >= 0),
  is_free          boolean NOT NULL DEFAULT false,
  effective_date   date,
  valid_until      date,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_verified      boolean NOT NULL DEFAULT false,
  source_reference text,
  verified_at      date,
  notes            text,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       text,
  updated_by       text,
  CHECK (valid_until IS NULL OR effective_date IS NULL OR valid_until >= effective_date),
  -- A verified price needs its source and the date it was checked
  CHECK (NOT is_verified OR (source_reference IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (is_free OR price IS NOT NULL OR NOT is_verified)
);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_prices_unique_idx
  ON ticket_prices (lower(category), lower(visitor_type), coalesce(effective_date, DATE '1900-01-01'));
ALTER TABLE ticket_prices ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ticket_price_history (
  id              bigserial PRIMARY KEY,
  ticket_price_id integer REFERENCES ticket_prices (id) ON DELETE SET NULL,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  changed_by      text,
  change_type     text NOT NULL,
  before          jsonb,
  after           jsonb
);
ALTER TABLE ticket_price_history ENABLE ROW LEVEL SECURITY;

-- ─── Announcements: priority, scheduling, status ─────────────────────────────
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS publish_at timestamptz;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_by text;
UPDATE announcements SET status = CASE WHEN is_active THEN 'published' ELSE 'draft' END;
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_priority_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_status_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'published', 'archived'));
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_dates_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_dates_check CHECK (expires_at IS NULL OR publish_at IS NULL OR expires_at > publish_at);

-- ─── Events: status, scheduled publication, map place ────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE events ADD COLUMN IF NOT EXISTS publish_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS pin_id integer REFERENCES map_pins (id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_by text;
UPDATE events SET status = CASE WHEN is_active THEN 'published' ELSE 'draft' END;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN ('draft', 'published', 'cancelled', 'archived'));
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_dates_check;
ALTER TABLE events ADD CONSTRAINT events_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

-- ─── Map: label visibility, location photo, saved versions ───────────────────
ALTER TABLE map_pins ADD COLUMN IF NOT EXISTS show_label boolean NOT NULL DEFAULT true;
ALTER TABLE map_pins ADD COLUMN IF NOT EXISTS image_url text;
CREATE TABLE IF NOT EXISTS map_versions (
  id            serial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text,
  reason        text NOT NULL DEFAULT 'manual',
  note          text,
  pin_count     integer NOT NULL,
  feature_count integer NOT NULL,
  path_count    integer NOT NULL,
  snapshot      jsonb NOT NULL
);
ALTER TABLE map_versions ENABLE ROW LEVEL SECURITY;

-- ─── Settings editable from the admin dashboard ──────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- ─── Visitor form submissions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_submissions (
  id          serial PRIMARY KEY,
  form_type   text NOT NULL DEFAULT 'inquiry' CHECK (form_type IN ('inquiry', 'group_visit')),
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  email       text CHECK (email IS NULL OR email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'),
  phone       text,
  subject     text,
  message     text NOT NULL CHECK (length(trim(message)) BETWEEN 5 AND 2000),
  visit_date  date,
  group_size  integer CHECK (group_size IS NULL OR group_size BETWEEN 1 AND 1000),
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved', 'archived')),
  admin_note  text,
  fingerprint text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_fingerprint_idx ON form_submissions (fingerprint);
CREATE INDEX IF NOT EXISTS form_submissions_status_idx ON form_submissions (status, created_at DESC);
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

-- ─── Backup metadata ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backups (
  id             serial PRIMARY KEY,
  backup_type    text NOT NULL CHECK (backup_type IN ('full', 'differential')),
  base_backup_id integer REFERENCES backups (id) ON DELETE RESTRICT,
  reason         text NOT NULL DEFAULT 'manual',
  status         text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  created_by     text,
  file_name      text,
  size_bytes     bigint,
  sha256         text,
  row_count      integer,
  changed_rows   integer,
  file_count     integer,
  tables         jsonb,
  error          text,
  CHECK (backup_type = 'full' OR base_backup_id IS NOT NULL)
);
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
`,
  },
  {
    // TRUNCATE skips row triggers, so the audit log needs a statement-level guard as well
    id: "2026-10-21-02-audit-no-truncate",
    sql: `
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();
`,
  },
  {
    // Visitors register through the website QR code. Visitor numbers are counted from these saved
    // rows only, so scanning the code or opening a page never counts anyone. The id is created by
    // the visitor's browser once per form, so a retried or repeated submit can't be saved twice.
    id: "2026-10-26-01-visitor-registrations",
    sql: `
CREATE TABLE IF NOT EXISTS visitor_registrations (
  id              uuid PRIMARY KEY,
  full_name       text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  email           text NOT NULL CHECK (length(email) <= 200 AND email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'),
  phone           text NOT NULL CHECK (phone ~ '^\\+639[0-9]{9}$'),
  age             integer NOT NULL CHECK (age BETWEEN 1 AND 120),
  sex             text NOT NULL CHECK (sex IN ('male', 'female')),
  party_size      integer NOT NULL CHECK (party_size BETWEEN 1 AND 500),
  consent_at      timestamptz NOT NULL,
  privacy_version text NOT NULL,
  visit_date      date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitor_registrations_date_idx ON visitor_registrations (visit_date);
CREATE INDEX IF NOT EXISTS visitor_registrations_contact_idx ON visitor_registrations (lower(email), phone, created_at DESC);
ALTER TABLE visitor_registrations ENABLE ROW LEVEL SECURITY;
`,
  },
  {
    // Everyone in a registered group, once each: their age, one age category (child under 18, adult
    // 18–59, senior citizen 60+ as in RA 9994) and whether they are a PWD. PWD is a flag on a person,
    // not a separate group, so a senior who is a PWD is still one person. The number of members must
    // equal the registration's group size; this is checked when the saving transaction commits.
    id: "2026-10-26-02-visitor-group-members",
    sql: `
ALTER TABLE visitor_registrations ADD COLUMN IF NOT EXISTS pwd_consent_at timestamptz;

CREATE TABLE IF NOT EXISTS visitor_group_members (
  id              serial PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES visitor_registrations (id) ON DELETE CASCADE,
  member_no       integer NOT NULL CHECK (member_no BETWEEN 1 AND 500),
  age             integer NOT NULL CHECK (age BETWEEN 0 AND 120),
  age_category    text NOT NULL CHECK (age_category IN ('child', 'adult', 'senior')),
  is_pwd          boolean NOT NULL DEFAULT false,
  is_registrant   boolean NOT NULL DEFAULT false,
  UNIQUE (registration_id, member_no),
  CHECK ((age_category = 'child' AND age < 18) OR (age_category = 'adult' AND age BETWEEN 18 AND 59) OR (age_category = 'senior' AND age >= 60))
);
CREATE INDEX IF NOT EXISTS visitor_group_members_registration_idx ON visitor_group_members (registration_id);
CREATE UNIQUE INDEX IF NOT EXISTS visitor_group_members_one_registrant_idx ON visitor_group_members (registration_id) WHERE is_registrant;
ALTER TABLE visitor_group_members ENABLE ROW LEVEL SECURITY;

-- A registration's members must add up to its group size (checked at commit, after all rows are in)
CREATE OR REPLACE FUNCTION visitor_group_size_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  reg uuid := COALESCE(NEW.registration_id, OLD.registration_id);
  expected integer;
  actual integer;
BEGIN
  IF TG_TABLE_NAME = 'visitor_registrations' THEN reg := NEW.id; END IF;
  SELECT party_size INTO expected FROM visitor_registrations WHERE id = reg;
  IF expected IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO actual FROM visitor_group_members WHERE registration_id = reg;
  IF actual <> expected THEN
    RAISE EXCEPTION 'Group size % does not match % group members for registration %', expected, actual, reg USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS visitor_registrations_group_size ON visitor_registrations;
CREATE CONSTRAINT TRIGGER visitor_registrations_group_size AFTER INSERT OR UPDATE OF party_size ON visitor_registrations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION visitor_group_size_check();
DROP TRIGGER IF EXISTS visitor_group_members_group_size ON visitor_group_members;
CREATE CONSTRAINT TRIGGER visitor_group_members_group_size AFTER INSERT OR UPDATE OR DELETE ON visitor_group_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION visitor_group_size_check();
`,
  },
  {
    // The group-size check read NEW.registration_id before knowing which table fired it; a
    // visitor_registrations row has no such field, so look at the table first
    id: "2026-10-26-03-visitor-group-size-check-fix",
    sql: `
CREATE OR REPLACE FUNCTION visitor_group_size_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  reg uuid;
  expected integer;
  actual integer;
BEGIN
  IF TG_TABLE_NAME = 'visitor_registrations' THEN
    reg := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    reg := OLD.registration_id;
  ELSE
    reg := NEW.registration_id;
  END IF;
  SELECT party_size INTO expected FROM visitor_registrations WHERE id = reg;
  IF expected IS NULL THEN RETURN NULL; END IF;  -- the registration itself was deleted
  SELECT count(*) INTO actual FROM visitor_group_members WHERE registration_id = reg;
  IF actual <> expected THEN
    RAISE EXCEPTION 'Group size % does not match % group members for registration %', expected, actual, reg USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
`,
  },
  {
    // Visitor accounts: the first visit creates a Supabase account and this profile; later visits log
    // in and add a new visit. Accounts live in Supabase Auth (a separate database), so user_id holds
    // the Supabase account id, which the API only ever takes from a verified login token.
    // Each visit stays its own row in visitor_registrations (numbered per account) with its own group
    // members; a profile that has visits can't be deleted, so visit history is never lost.
    id: "2026-10-27-01-visitor-accounts",
    sql: `
CREATE TABLE IF NOT EXISTS visitor_profiles (
  user_id         uuid PRIMARY KEY,
  full_name       text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  email           text NOT NULL CHECK (length(email) <= 200 AND email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'),
  phone           text NOT NULL CHECK (phone ~ '^\\+639[0-9]{9}$'),
  age             integer NOT NULL CHECK (age BETWEEN 1 AND 120),
  sex             text NOT NULL CHECK (sex IN ('male', 'female')),
  consent_at      timestamptz NOT NULL,
  privacy_version text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS visitor_profiles_email_idx ON visitor_profiles (lower(email));
ALTER TABLE visitor_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE visitor_registrations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES visitor_profiles (user_id) ON DELETE RESTRICT;
ALTER TABLE visitor_registrations ADD COLUMN IF NOT EXISTS visit_no integer CHECK (visit_no IS NULL OR visit_no >= 1);
ALTER TABLE visitor_registrations DROP CONSTRAINT IF EXISTS visitor_registrations_account_visit_no;
ALTER TABLE visitor_registrations ADD CONSTRAINT visitor_registrations_account_visit_no CHECK ((user_id IS NULL) = (visit_no IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS visitor_registrations_user_visit_idx ON visitor_registrations (user_id, visit_no) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS visitor_registrations_user_idx ON visitor_registrations (user_id, created_at DESC);
`,
  },
  {
    // One count per person per visit day. A visit's people (visitor_group_members) can now point to
    // the visitor account they belong to: always the registered visitor, and a companion when the
    // registrant links them with the companion's email + Visitor ID (a code only that visitor sees).
    // A unique index then lets each account be counted at most once per day, whoever registers them,
    // even when two requests arrive together. Companions without an account (babies, children,
    // seniors without a phone) stay as unlinked people on that visit and are counted with it.
    // Existing data: the earliest visit of an account on a day is linked; a second same-day visit made
    // before this rule keeps its people unlinked, so nothing is deleted or changed in the counts.
    id: "2026-10-28-01-visit-attendance",
    sql: `
-- Run the group-size checks as each row changes here (deferred checks block ALTER TABLE)
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE visitor_profiles ADD COLUMN IF NOT EXISTS visitor_code text;
UPDATE visitor_profiles SET visitor_code = 'MZV-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)) WHERE visitor_code IS NULL;
ALTER TABLE visitor_profiles ALTER COLUMN visitor_code SET DEFAULT 'MZV-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
ALTER TABLE visitor_profiles ALTER COLUMN visitor_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS visitor_profiles_code_idx ON visitor_profiles (visitor_code);

ALTER TABLE visitor_group_members ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES visitor_profiles (user_id) ON DELETE SET NULL;
ALTER TABLE visitor_group_members ADD COLUMN IF NOT EXISTS visit_date date;
UPDATE visitor_group_members m SET visit_date = r.visit_date FROM visitor_registrations r WHERE r.id = m.registration_id AND m.visit_date IS NULL;
ALTER TABLE visitor_group_members ALTER COLUMN visit_date SET NOT NULL;
UPDATE visitor_group_members m SET user_id = r.user_id
  FROM (SELECT id, user_id, row_number() OVER (PARTITION BY user_id, visit_date ORDER BY created_at) AS n
          FROM visitor_registrations WHERE user_id IS NOT NULL) r
 WHERE r.id = m.registration_id AND m.is_registrant AND r.n = 1 AND m.user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS visitor_group_members_one_per_day ON visitor_group_members (user_id, visit_date) WHERE user_id IS NOT NULL;

-- Each person's visit date always comes from their visit, and the registered visitor is always their own account
CREATE OR REPLACE FUNCTION visitor_member_fill() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reg record;
BEGIN
  SELECT visit_date, user_id INTO reg FROM visitor_registrations WHERE id = NEW.registration_id;
  NEW.visit_date := reg.visit_date;
  IF NEW.is_registrant AND TG_OP = 'INSERT' THEN NEW.user_id := reg.user_id; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS visitor_group_members_fill ON visitor_group_members;
CREATE TRIGGER visitor_group_members_fill BEFORE INSERT OR UPDATE OF registration_id, visit_date ON visitor_group_members
  FOR EACH ROW EXECUTE FUNCTION visitor_member_fill();
CREATE OR REPLACE FUNCTION visitor_registration_date_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE visitor_group_members SET visit_date = NEW.visit_date WHERE registration_id = NEW.id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS visitor_registrations_date_sync ON visitor_registrations;
CREATE TRIGGER visitor_registrations_date_sync AFTER UPDATE OF visit_date ON visitor_registrations
  FOR EACH ROW WHEN (OLD.visit_date IS DISTINCT FROM NEW.visit_date) EXECUTE FUNCTION visitor_registration_date_sync();
`,
  },
  {
    // Administrator accounts created by the Director. The login itself (and its password, hashed with
    // bcrypt) lives in Supabase Auth; this table holds the username used to sign in and the account's
    // state. No password is ever stored here. must_change_credentials mirrors the flag in the account's
    // app_metadata, which is what the API enforces.
    id: "2026-11-08-01-admin-accounts",
    sql: `
CREATE TABLE IF NOT EXISTS admin_accounts (
  user_id                 uuid PRIMARY KEY,
  username                text NOT NULL CHECK (username ~ '^[a-z0-9._]{4,32}$'),
  full_name               text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  must_change_credentials boolean NOT NULL DEFAULT true,
  is_active               boolean NOT NULL DEFAULT true,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  credentials_changed_at  timestamptz,
  last_reset_at           timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_username_idx ON admin_accounts (lower(username));
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;
`,
  },
  {
    // QR points and rewards. Every point earned or spent is one row in point_transactions (a ledger),
    // so a visitor's balance is the sum of their rows and their history is the rows themselves.
    // claim_key is unique: the same claim (this QR code for this visitor, this game stop, this
    // redemption) can only ever be written once, whatever the browser sends or how often.
    // Points from the existing scavenger hunts are copied in so no one loses what they've earned.
    id: "2026-11-08-02-qr-points-rewards",
    sql: `
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS points_once boolean NOT NULL DEFAULT true;
ALTER TABLE qr_codes DROP CONSTRAINT IF EXISTS qr_codes_points_check;
ALTER TABLE qr_codes ADD CONSTRAINT qr_codes_points_check CHECK (points BETWEEN 0 AND 1000);

CREATE TABLE IF NOT EXISTS rewards (
  id          serial PRIMARY KEY,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  name_fil    text,
  description text,
  emoji       text NOT NULL DEFAULT '🎁',
  cost        integer NOT NULL CHECK (cost BETWEEN 1 AND 100000),
  stock       integer CHECK (stock IS NULL OR stock >= 0),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id           serial PRIMARY KEY,
  user_id      text NOT NULL,
  display_name text NOT NULL,
  reward_id    integer NOT NULL REFERENCES rewards (id) ON DELETE RESTRICT,
  reward_name  text NOT NULL,
  cost         integer NOT NULL CHECK (cost > 0),
  code         text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz,
  claimed_by   text,
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS reward_redemptions_user_idx ON reward_redemptions (user_id, created_at DESC);
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS point_transactions (
  id              bigserial PRIMARY KEY,
  user_id         text NOT NULL,
  display_name    text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('scan', 'game', 'game_bonus', 'redeem', 'refund')),
  points          integer NOT NULL CHECK (points <> 0),
  label           text NOT NULL,
  qr_code_id      integer REFERENCES qr_codes (id) ON DELETE SET NULL,
  animal_id       integer,
  map_pin_id      integer,
  game_id         integer,
  redemption_id   integer REFERENCES reward_redemptions (id) ON DELETE SET NULL,
  registration_id uuid,
  claim_key       text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('redeem')) = (points < 0))
);
CREATE INDEX IF NOT EXISTS point_transactions_user_idx ON point_transactions (user_id, created_at DESC);
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

-- Points already earned in the scavenger hunts (game_progress exists once the games module has started)
DO $$ BEGIN
  IF to_regclass('public.game_progress') IS NOT NULL THEN
    INSERT INTO point_transactions (user_id, display_name, kind, points, label, animal_id, game_id, registration_id, claim_key, created_at)
    SELECT p.user_id, p.display_name,
           CASE WHEN p.animal_id = 0 THEN 'game_bonus' ELSE 'game' END,
           p.points,
           CASE WHEN p.animal_id = 0 THEN coalesce(g.title, 'Game') || ': completion bonus'
                ELSE coalesce(g.title, 'Game') || ': ' || coalesce(a.name, 'animal') END,
           NULLIF(p.animal_id, 0), p.game_id, p.registration_id,
           'game:' || p.game_id || ':' || p.animal_id || ':' || p.user_id, p.created_at
      FROM game_progress p LEFT JOIN games g ON g.id = p.game_id LEFT JOIN animals a ON a.id = p.animal_id
     WHERE p.points > 0
    ON CONFLICT (claim_key) DO NOTHING;
  END IF;
END $$;
`,
  },
  {
    // Facilities and Park Areas (admin dashboard), shown on the 3D map. Loads the site plan's
    // facilities, planting zones and tree markers once (lib/parkSeed.ts).
    id: "2026-11-12-01-facilities-park-areas",
    sql: `
CREATE TABLE IF NOT EXISTS facilities (
  id          serial PRIMARY KEY,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  type        text NOT NULL CHECK (type IN ('enclosure', 'building', 'water_feature', 'landscape', 'parking', 'security', 'restroom', 'medical', 'utility', 'other')),
  description text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'maintenance', 'closed')),
  photo_url   text,
  lat         double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- No two facilities with the same name, whatever the capitals or spaces
CREATE UNIQUE INDEX IF NOT EXISTS facilities_name_key ON facilities (lower(btrim(name)));
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS park_zones (
  id             serial PRIMARY KEY,
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  marker_shape   text NOT NULL CHECK (marker_shape IN ('circle', 'ring', 'star', 'triangle', 'diamond', 'square', 'pentagon', 'heart', 'asterisk')),
  marker_color   text NOT NULL CHECK (marker_color ~ '^#[0-9a-fA-F]{6}$'),
  description    text,
  -- The species the site plan's legend lists for this zone (suggested when adding a tree)
  legend_species text[] NOT NULL DEFAULT '{}',
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS park_zones_name_key ON park_zones (lower(btrim(name)));
ALTER TABLE park_zones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS zone_trees (
  id          serial PRIMARY KEY,
  -- A zone can't be deleted while it still has trees (move or remove them first)
  zone_id     integer NOT NULL REFERENCES park_zones (id) ON DELETE RESTRICT,
  species     text,
  status      text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'needs_care', 'dead', 'unidentified')),
  notes       text,
  lat         double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  -- 'site_plan' for the markers loaded from the plan, 'manual' for trees added in the dashboard
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('site_plan', 'manual')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zone_trees_zone_idx ON zone_trees (zone_id);
ALTER TABLE zone_trees ENABLE ROW LEVEL SECURITY;
${parkSeedSql()}`,
  },
  {
    // Deleting an animal failed when visitors had viewed it or scanned its QR code: analytics rows
    // pointed at the animal (and at its QR codes, which the delete removes) with no delete rule.
    // Visit statistics are kept; they just lose the link to the deleted animal or code.
    id: "2026-11-15-01-animal-delete-keeps-analytics",
    sql: `
ALTER TABLE analytics DROP CONSTRAINT IF EXISTS analytics_animal_id_animals_id_fk;
ALTER TABLE analytics ADD CONSTRAINT analytics_animal_id_animals_id_fk
  FOREIGN KEY (animal_id) REFERENCES animals (id) ON DELETE SET NULL;
ALTER TABLE analytics DROP CONSTRAINT IF EXISTS analytics_qr_code_id_qr_codes_id_fk;
ALTER TABLE analytics ADD CONSTRAINT analytics_qr_code_id_qr_codes_id_fk
  FOREIGN KEY (qr_code_id) REFERENCES qr_codes (id) ON DELETE SET NULL;`,
  },
  {
    // Map Management publishing: walkways and facilities get a Published switch like places and
    // footprints (existing rows stay published), and a walkway can be a bridge (drawn as a timber
    // footbridge on both maps) instead of only the one named "Lagoon footbridge".
    id: "2026-11-16-01-map-publishing-and-bridges",
    sql: `
ALTER TABLE map_paths ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE map_paths ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'walkway';
ALTER TABLE map_paths DROP CONSTRAINT IF EXISTS map_paths_kind_check;
ALTER TABLE map_paths ADD CONSTRAINT map_paths_kind_check CHECK (kind IN ('walkway', 'bridge'));
UPDATE map_paths SET kind = 'bridge' WHERE name = 'Lagoon footbridge';
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;`,
  },
];

export async function runMigrations(): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    await client.query("ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY");
    const { rows } = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
    const done = new Set(rows.map(r => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await client.query("COMMIT");
        applied.push(m.id);
        logger.info({ migration: m.id }, "Applied database migration");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${m.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    client.release();
  }
  return applied;
}
