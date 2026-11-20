-- Manila Zoo Navigation and Information System: database schema (PostgreSQL)
-- Generated from the live database on 2026-11-18: 39 tables, 24 foreign keys.
-- For diagrams (e.g. drawsql.app): columns, types, keys and relationships only;
-- defaults, CHECK rules and indexes are left out. Array columns (text[]) are shown as TEXT.

CREATE TABLE admin_accounts (
  user_id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  full_name TEXT NOT NULL,
  must_change_credentials BOOLEAN NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  credentials_changed_at TIMESTAMPTZ,
  last_reset_at TIMESTAMPTZ
);

CREATE TABLE analytics (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  animal_id INTEGER,
  qr_code_id INTEGER,
  session_id TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE animal_feedback (
  id SERIAL PRIMARY KEY,
  animal_id INTEGER NOT NULL,
  rating INTEGER,
  comment TEXT,
  is_resolved BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE animal_gallery (
  id SERIAL PRIMARY KEY,
  animal_id INTEGER,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER,
  created_at TIMESTAMPTZ
);

CREATE TABLE animals (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  scientific_name TEXT,
  common_name TEXT,
  category_id INTEGER,
  kingdom TEXT,
  phylum TEXT,
  class TEXT,
  "order" TEXT,
  family TEXT,
  genus TEXT,
  species TEXT,
  habitat TEXT,
  diet TEXT,
  weight_kg NUMERIC,
  height_cm NUMERIC,
  lifespan_years NUMERIC,
  conservation_status TEXT,
  description TEXT,
  interesting_facts TEXT,
  feeding_schedule TEXT,
  image_url TEXT,
  location_id INTEGER,
  is_featured BOOLEAN NOT NULL,
  view_count INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
);

CREATE TABLE announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  type TEXT,
  expires_at TIMESTAMP,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  publish_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  record_id TEXT,
  result TEXT NOT NULL,
  before JSONB,
  after JSONB,
  context JSONB,
  prev_hash TEXT,
  hash TEXT NOT NULL
);

CREATE TABLE backups (
  id SERIAL PRIMARY KEY,
  backup_type TEXT NOT NULL,
  base_backup_id INTEGER,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  created_by TEXT,
  file_name TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  row_count INTEGER,
  changed_rows INTEGER,
  file_count INTEGER,
  tables JSONB,
  error TEXT
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE chat_history (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  intent TEXT,
  confidence NUMERIC,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  location TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL,
  publish_at TIMESTAMPTZ,
  pin_id INTEGER,
  updated_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE facilities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  photo_url TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL
);

CREATE TABLE faq (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL UNIQUE,
  answer TEXT NOT NULL,
  category TEXT,
  language TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE favorites (
  id SERIAL PRIMARY KEY,
  animal_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  UNIQUE (animal_id, user_id)
);

CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  chat_history_id INTEGER,
  rating INTEGER,
  comment TEXT,
  session_id TEXT,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE form_submissions (
  id SERIAL PRIMARY KEY,
  form_type TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  visit_date DATE,
  group_size INTEGER,
  status TEXT NOT NULL,
  admin_note TEXT,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT
);

CREATE TABLE game_progress (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  animal_id INTEGER NOT NULL,
  points INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  registration_id UUID,
  UNIQUE (game_id, user_id, animal_id)
);

CREATE TABLE game_stops (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL,
  animal_id INTEGER NOT NULL,
  hint TEXT,
  hint_fil TEXT,
  sort_order INTEGER NOT NULL,
  UNIQUE (game_id, animal_id)
);

CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  title_fil TEXT,
  description TEXT,
  description_fil TEXT,
  emoji TEXT NOT NULL,
  points_per_stop INTEGER NOT NULL,
  completion_bonus INTEGER NOT NULL,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE map_config (
  id SERIAL PRIMARY KEY,
  map_image_url TEXT,
  center_lat NUMERIC NOT NULL,
  center_lng NUMERIC NOT NULL,
  default_zoom INTEGER NOT NULL,
  updated_at TIMESTAMP,
  sw_lat NUMERIC,
  sw_lng NUMERIC,
  ne_lat NUMERIC,
  ne_lng NUMERIC
);

CREATE TABLE map_features (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  geometry JSONB NOT NULL,
  height_m NUMERIC NOT NULL,
  min_height_m NUMERIC NOT NULL,
  wall_color TEXT,
  roof_color TEXT,
  map_pin_id INTEGER,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
);

CREATE TABLE map_layout_meta (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE map_paths (
  id SERIAL PRIMARY KEY,
  name TEXT,
  geometry JSONB NOT NULL,
  is_open BOOLEAN NOT NULL,
  is_accessible BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  is_active BOOLEAN NOT NULL,
  kind TEXT NOT NULL
);

CREATE TABLE map_pins (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  pin_type TEXT NOT NULL,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  animal_id INTEGER,
  description TEXT,
  color TEXT,
  icon TEXT,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  show_label BOOLEAN NOT NULL,
  image_url TEXT
);

CREATE TABLE map_versions (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT,
  reason TEXT NOT NULL,
  note TEXT,
  pin_count INTEGER NOT NULL,
  feature_count INTEGER NOT NULL,
  path_count INTEGER NOT NULL,
  snapshot JSONB NOT NULL
);

CREATE TABLE park_zones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  marker_shape TEXT NOT NULL,
  marker_color TEXT NOT NULL,
  description TEXT,
  legend_species TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE point_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  points INTEGER NOT NULL,
  label TEXT NOT NULL,
  qr_code_id INTEGER,
  animal_id INTEGER,
  map_pin_id INTEGER,
  game_id INTEGER,
  redemption_id INTEGER,
  registration_id UUID,
  claim_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE qr_codes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  animal_id INTEGER,
  qr_image_url TEXT,
  scan_count INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  map_pin_id INTEGER,
  points INTEGER NOT NULL,
  points_once BOOLEAN NOT NULL
);

CREATE TABLE reward_redemptions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  reward_id INTEGER NOT NULL,
  reward_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE rewards (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_fil TEXT,
  description TEXT,
  emoji TEXT NOT NULL,
  cost INTEGER NOT NULL,
  stock INTEGER,
  is_active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT
);

CREATE TABLE ticket_price_history (
  id BIGSERIAL PRIMARY KEY,
  ticket_price_id INTEGER,
  changed_at TIMESTAMPTZ NOT NULL,
  changed_by TEXT,
  change_type TEXT NOT NULL,
  before JSONB,
  after JSONB
);

CREATE TABLE ticket_prices (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  visitor_type TEXT NOT NULL,
  price NUMERIC(10,2),
  is_free BOOLEAN NOT NULL,
  effective_date DATE,
  valid_until DATE,
  status TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL,
  source_reference TEXT,
  verified_at DATE,
  notes TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE training_dataset (
  id SERIAL PRIMARY KEY,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  intent TEXT,
  language TEXT NOT NULL,
  is_validated BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE visitor_group_members (
  id SERIAL PRIMARY KEY,
  registration_id UUID NOT NULL,
  member_no INTEGER NOT NULL,
  age INTEGER NOT NULL,
  age_category TEXT NOT NULL,
  is_pwd BOOLEAN NOT NULL,
  is_registrant BOOLEAN NOT NULL,
  user_id UUID,
  visit_date DATE NOT NULL,
  UNIQUE (registration_id, member_no)
);

CREATE TABLE visitor_profiles (
  user_id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  privacy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  visitor_code TEXT NOT NULL
);

CREATE TABLE visitor_registrations (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  privacy_version TEXT NOT NULL,
  visit_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  pwd_consent_at TIMESTAMPTZ,
  user_id UUID,
  visit_no INTEGER
);

CREATE TABLE zone_trees (
  id SERIAL PRIMARY KEY,
  zone_id INTEGER NOT NULL,
  species TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE zoo_updates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

-- Relationships
ALTER TABLE analytics ADD FOREIGN KEY (animal_id) REFERENCES animals (id);
ALTER TABLE analytics ADD FOREIGN KEY (qr_code_id) REFERENCES qr_codes (id);
ALTER TABLE animal_feedback ADD FOREIGN KEY (animal_id) REFERENCES animals (id);
ALTER TABLE animal_gallery ADD FOREIGN KEY (animal_id) REFERENCES animals (id);
ALTER TABLE animals ADD FOREIGN KEY (category_id) REFERENCES categories (id);
ALTER TABLE animals ADD FOREIGN KEY (location_id) REFERENCES map_pins (id);
ALTER TABLE backups ADD FOREIGN KEY (base_backup_id) REFERENCES backups (id);
ALTER TABLE events ADD FOREIGN KEY (pin_id) REFERENCES map_pins (id);
ALTER TABLE favorites ADD FOREIGN KEY (animal_id) REFERENCES animals (id);
ALTER TABLE feedback ADD FOREIGN KEY (chat_history_id) REFERENCES chat_history (id);
ALTER TABLE game_progress ADD FOREIGN KEY (game_id) REFERENCES games (id);
ALTER TABLE game_stops ADD FOREIGN KEY (animal_id) REFERENCES animals (id);
ALTER TABLE game_stops ADD FOREIGN KEY (game_id) REFERENCES games (id);
ALTER TABLE map_features ADD FOREIGN KEY (map_pin_id) REFERENCES map_pins (id);
ALTER TABLE point_transactions ADD FOREIGN KEY (qr_code_id) REFERENCES qr_codes (id);
ALTER TABLE point_transactions ADD FOREIGN KEY (redemption_id) REFERENCES reward_redemptions (id);
ALTER TABLE qr_codes ADD FOREIGN KEY (animal_id) REFERENCES animals (id);
ALTER TABLE qr_codes ADD FOREIGN KEY (map_pin_id) REFERENCES map_pins (id);
ALTER TABLE reward_redemptions ADD FOREIGN KEY (reward_id) REFERENCES rewards (id);
ALTER TABLE ticket_price_history ADD FOREIGN KEY (ticket_price_id) REFERENCES ticket_prices (id);
ALTER TABLE visitor_group_members ADD FOREIGN KEY (registration_id) REFERENCES visitor_registrations (id);
ALTER TABLE visitor_group_members ADD FOREIGN KEY (user_id) REFERENCES visitor_profiles (user_id);
ALTER TABLE visitor_registrations ADD FOREIGN KEY (user_id) REFERENCES visitor_profiles (user_id);
ALTER TABLE zone_trees ADD FOREIGN KEY (zone_id) REFERENCES park_zones (id);
