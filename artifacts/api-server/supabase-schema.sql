-- Manila Zoo Navigation System — Supabase Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'visitor' check (role in ('visitor', 'admin', 'staff')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Admins can manage all profiles" on public.profiles
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
-- Users may edit their own name and photo but never their role; roles are set with the
-- service key (`pnpm create-admin`, or the admin Users page through the API)
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, updated_at) on public.profiles to authenticated;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'visitor');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- CATEGORIES
-- ============================================================
create table if not exists public.categories (
  id serial primary key,
  name text not null,
  description text,
  icon text,
  color text default '#4CAF50',
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
create policy "Categories are viewable by everyone" on public.categories for select using (true);
create policy "Admins can manage categories" on public.categories
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- ANIMALS
-- ============================================================
create table if not exists public.animals (
  id serial primary key,
  name text not null,
  scientific_name text,
  common_name text,
  category_id integer references public.categories(id),
  kingdom text,
  phylum text,
  class text,
  "order" text,
  family text,
  genus text,
  species text,
  habitat text,
  diet text,
  weight_kg numeric,
  height_cm numeric,
  lifespan_years numeric,
  conservation_status text check (conservation_status in (
    'Extinct', 'Extinct in the Wild', 'Critically Endangered',
    'Endangered', 'Vulnerable', 'Near Threatened', 'Least Concern', 'Data Deficient'
  )),
  description text,
  interesting_facts text[],
  feeding_schedule text,
  image_url text,
  location_id integer,
  is_featured boolean not null default false,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.animals enable row level security;
create policy "Animals are viewable by everyone" on public.animals for select using (true);
create policy "Admins can manage animals" on public.animals
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- ANIMAL GALLERY
-- ============================================================
create table if not exists public.animal_gallery (
  id serial primary key,
  animal_id integer not null references public.animals(id) on delete cascade,
  image_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.animal_gallery enable row level security;
create policy "Gallery is viewable by everyone" on public.animal_gallery for select using (true);
create policy "Admins can manage gallery" on public.animal_gallery
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- MAP PINS
-- ============================================================
create table if not exists public.map_pins (
  id serial primary key,
  name text not null,
  pin_type text not null default 'animal' check (pin_type in (
    'animal', 'building', 'restroom', 'food_stall', 'emergency', 'exit', 'entrance'
  )),
  lat numeric not null,
  lng numeric not null,
  animal_id integer references public.animals(id),
  description text,
  color text default '#2D6A4F',
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.map_pins enable row level security;
create policy "Map pins are viewable by everyone" on public.map_pins for select using (true);
create policy "Admins can manage map pins" on public.map_pins
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- Add FK from animals to map_pins
alter table public.animals add column if not exists location_id integer references public.map_pins(id);

-- ============================================================
-- MAP CONFIG
-- ============================================================
create table if not exists public.map_config (
  id serial primary key,
  map_image_url text,
  center_lat numeric not null default 14.5632,
  center_lng numeric not null default 121.0167,
  default_zoom integer not null default 17,
  updated_at timestamptz
);

alter table public.map_config enable row level security;
create policy "Map config is viewable by everyone" on public.map_config for select using (true);
create policy "Admins can manage map config" on public.map_config
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- Insert default config
insert into public.map_config (map_image_url, center_lat, center_lng, default_zoom)
values ('', 14.5632, 121.0167, 17)
on conflict do nothing;

-- Georeferenced corners of the floor-plan image overlay
alter table public.map_config
  add column if not exists sw_lat numeric, add column if not exists sw_lng numeric,
  add column if not exists ne_lat numeric, add column if not exists ne_lng numeric;

-- ============================================================
-- MAP LAYOUT (2.5D features, walkways, version counter)
-- ============================================================
create table if not exists public.map_features (
  id serial primary key,
  name text not null,
  feature_type text not null default 'enclosure' check (feature_type in (
    'enclosure', 'building', 'facility', 'water', 'landscape'
  )),
  geometry jsonb not null,                 -- GeoJSON Polygon, [lng, lat]
  height_m numeric not null default 0,     -- extrusion height in meters
  min_height_m numeric not null default 0,
  wall_color text default '#bfa98a',
  roof_color text default '#7a9a6e',
  map_pin_id integer references public.map_pins(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp
);

create table if not exists public.map_paths (
  id serial primary key,
  name text,
  geometry jsonb not null,                 -- GeoJSON LineString, [lng, lat]
  is_open boolean not null default true,
  is_accessible boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp
);

-- Bumped by the API on every map write; clients poll GET /api/map/version
create table if not exists public.map_layout_meta (
  id integer primary key default 1,
  version integer not null default 1,
  updated_at timestamp not null default now()
);
insert into public.map_layout_meta (id, version) values (1, 1) on conflict do nothing;

alter table public.map_features enable row level security;
alter table public.map_paths enable row level security;
alter table public.map_layout_meta enable row level security;
create policy "Map features are viewable by everyone" on public.map_features for select using (true);
create policy "Map paths are viewable by everyone" on public.map_paths for select using (true);
create policy "Map layout meta is viewable by everyone" on public.map_layout_meta for select using (true);
create policy "Admins can manage map features" on public.map_features
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );
create policy "Admins can manage map paths" on public.map_paths
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- QR CODES
-- ============================================================
create table if not exists public.qr_codes (
  id serial primary key,
  code text not null unique,
  animal_id integer references public.animals(id) on delete cascade,
  qr_image_url text,
  scan_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.qr_codes enable row level security;
create policy "QR codes are viewable by everyone" on public.qr_codes for select using (true);
create policy "Admins can manage QR codes" on public.qr_codes
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- CHAT HISTORY
-- ============================================================
create table if not exists public.chat_history (
  id serial primary key,
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  message text not null,
  intent text,
  confidence numeric,
  created_at timestamptz not null default now()
);

alter table public.chat_history enable row level security;
create policy "Chat history viewable by service role" on public.chat_history for all using (true);

-- ============================================================
-- FAQ
-- ============================================================
create table if not exists public.faq (
  id serial primary key,
  question text not null,
  answer text not null,
  category text,
  language text not null default 'en' check (language in ('en', 'fil')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.faq enable row level security;
create policy "FAQ is viewable by everyone" on public.faq for select using (true);
create policy "Admins can manage FAQ" on public.faq
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- FAVORITES
-- ============================================================
create table if not exists public.favorites (
  id serial primary key,
  animal_id integer not null references public.animals(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique (animal_id, user_id)
);

alter table public.favorites enable row level security;
create policy "Favorites are viewable by service role" on public.favorites for all using (true);

-- ============================================================
-- ANALYTICS
-- ============================================================
create table if not exists public.analytics (
  id serial primary key,
  event_type text not null,
  animal_id integer references public.animals(id),
  qr_code_id integer references public.qr_codes(id),
  session_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics enable row level security;
create policy "Analytics accessible by service role" on public.analytics for all using (true);

-- ============================================================
-- FEEDBACK
-- ============================================================
create table if not exists public.feedback (
  id serial primary key,
  chat_history_id integer references public.chat_history(id),
  rating integer check (rating between 1 and 5),
  comment text,
  session_id text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
create policy "Feedback accessible by service role" on public.feedback for all using (true);

-- ============================================================
-- EVENTS
-- ============================================================
create table if not exists public.events (
  id serial primary key,
  title text not null,
  description text,
  start_date timestamptz,
  end_date timestamptz,
  location text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;
create policy "Events are viewable by everyone" on public.events for select using (true);
create policy "Admins can manage events" on public.events
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
create table if not exists public.announcements (
  id serial primary key,
  title text not null,
  content text not null,
  type text default 'info' check (type in ('info', 'warning', 'success', 'error')),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
create policy "Announcements are viewable by everyone" on public.announcements for select using (true);
create policy "Admins can manage announcements" on public.announcements
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- TRAINING DATASET
-- ============================================================
create table if not exists public.training_dataset (
  id serial primary key,
  input text not null,
  output text not null,
  intent text,
  language text not null default 'en' check (language in ('en', 'fil')),
  is_validated boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.training_dataset enable row level security;
create policy "Training data accessible by admins" on public.training_dataset
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- ============================================================
-- SEED DATA
-- ============================================================

-- Categories
insert into public.categories (name, description, icon, color) values
  ('Mammals', 'Warm-blooded vertebrates with hair or fur', 'paw-print', '#F4A261'),
  ('Reptiles', 'Cold-blooded vertebrates with scales', 'egg', '#52B788'),
  ('Birds', 'Feathered vertebrates with wings', 'bird', '#74C0FC'),
  ('Amphibians', 'Animals that live on land and in water', 'droplets', '#96CEB4'),
  ('Fish', 'Aquatic vertebrates with gills and fins', 'fish', '#3D9BE9'),
  ('Insects', 'Six-legged invertebrates', 'bug', '#F9C74F')
on conflict do nothing;

-- Map Pins (Manila Zoo area, approximate coordinates)
insert into public.map_pins (name, pin_type, lat, lng, description, color, icon) values
  ('Main Entrance', 'entrance', 14.56350, 121.01620, 'Zoo main entrance and ticketing area', '#2D6A4F', 'door-open'),
  ('Reptile House', 'building', 14.56300, 121.01680, 'Home to crocodiles, pythons, and lizards', '#52B788', 'building'),
  ('Bird Sanctuary', 'building', 14.56250, 121.01720, 'Various bird species from the Philippines and around the world', '#74C0FC', 'bird'),
  ('African Savanna', 'building', 14.56200, 121.01650, 'Lions, giraffes, and other African animals', '#F4A261', 'building'),
  ('Restroom A', 'restroom', 14.56330, 121.01660, 'Restroom facilities near main entrance', '#ADB5BD', 'restroom'),
  ('Restroom B', 'restroom', 14.56230, 121.01700, 'Restroom facilities near bird sanctuary', '#ADB5BD', 'restroom'),
  ('Food Stall', 'food_stall', 14.56280, 121.01630, 'Food and beverage stalls', '#FF9F1C', 'utensils'),
  ('First Aid Station', 'emergency', 14.56320, 121.01640, 'First aid and emergency services', '#E63946', 'heart-pulse'),
  ('South Exit', 'exit', 14.56170, 121.01680, 'Emergency exit — south side', '#6C757D', 'sign-out'),
  ('Aquatic Center', 'building', 14.56240, 121.01750, 'Fish, amphibians, and aquatic exhibits', '#3D9BE9', 'building')
on conflict do nothing;

-- Animals (referencing map pins via location_id set after insert)
with pin_ids as (
  select id, name from public.map_pins
),
cat_ids as (
  select id, name from public.categories
)
insert into public.animals (
  name, scientific_name, common_name, category_id, 
  kingdom, phylum, class, "order", family, genus, species,
  habitat, diet, weight_kg, height_cm, lifespan_years,
  conservation_status, description, interesting_facts,
  feeding_schedule, image_url, is_featured, view_count
)
select
  v.name, v.scientific_name, v.common_name, cat_ids.id,
  v.kingdom, v.phylum, v.class, v."order", v.family, v.genus, v.species,
  v.habitat, v.diet, v.weight_kg, v.height_cm, v.lifespan_years,
  v.conservation_status, v.description, v.interesting_facts::text[],
  v.feeding_schedule, v.image_url, v.is_featured, v.view_count
from (values
  ('African Lion', 'Panthera leo', 'Lion', 'Mammals',
   'Animalia', 'Chordata', 'Mammalia', 'Carnivora', 'Felidae', 'Panthera', 'leo',
   'Savanna and grassland', 'Carnivore', 190.0, 120.0, 16.0,
   'Vulnerable', 'The African lion is the largest wild cat in Africa and the second largest in the world.',
   '{"Lions are the only cats that live in groups called prides","A lion''s roar can be heard up to 8 km away","Female lions do most of the hunting"}',
   'Daily at 10:00 AM and 3:00 PM', '/animals/african-lion.jpg', true, 1500),
  ('Reticulated Python', 'Malayopython reticulatus', 'Python', 'Reptiles',
   'Animalia', 'Chordata', 'Reptilia', 'Squamata', 'Pythonidae', 'Malayopython', 'reticulatus',
   'Tropical rainforests', 'Carnivore', 75.0, null, 25.0,
   'Least Concern', 'The reticulated python is the world''s longest snake, native to Southeast Asia.',
   '{"It is the world''s longest snake","They are excellent swimmers","Native to the Philippines"}',
   'Weekly on Wednesdays at 2:00 PM', '/animals/reticulated-python.jpg', true, 890),
  ('Philippine Eagle', 'Pithecophaga jefferyi', 'Agila ng Pilipinas', 'Birds',
   'Animalia', 'Chordata', 'Aves', 'Accipitriformes', 'Accipitridae', 'Pithecophaga', 'jefferyi',
   'Tropical forests', 'Carnivore', 8.0, 100.0, 60.0,
   'Critically Endangered', 'The Philippine Eagle is the national bird of the Philippines and one of the largest, most powerful eagles in the world.',
   '{"National bird of the Philippines","One of the rarest birds in the world","Can live up to 60 years in captivity"}',
   'Daily at 11:00 AM', '/animals/philippine-eagle.jpg', true, 2100),
  ('Saltwater Crocodile', 'Crocodylus porosus', 'Buwaya', 'Reptiles',
   'Animalia', 'Chordata', 'Reptilia', 'Crocodilia', 'Crocodylidae', 'Crocodylus', 'porosus',
   'Coastal waters and rivers', 'Carnivore', 450.0, 50.0, 70.0,
   'Least Concern', 'The saltwater crocodile is the largest living reptile and the largest riparian predator in the world.',
   '{"Largest living reptile","Can swim far into the ocean","Found throughout Southeast Asia and Australia"}',
   'Tuesdays and Fridays at 2:30 PM', '/animals/saltwater-crocodile.jpg', false, 760),
  ('Red-footed Tortoise', 'Chelonoidis carbonarius', 'Tortoise', 'Reptiles',
   'Animalia', 'Chordata', 'Reptilia', 'Testudines', 'Testudinidae', 'Chelonoidis', 'carbonarius',
   'Tropical forests and savannas', 'Herbivore', 9.0, 30.0, 50.0,
   'Vulnerable', 'A medium-sized tortoise from South America, popular in zoos for its distinctive red-scaled feet.',
   '{"Named for their distinctive red scales","Excellent diggers","Omnivorous in the wild"}',
   'Daily at 9:00 AM', '/animals/red-footed-tortoise.jpg', false, 340),
  ('Sun Bear', 'Helarctos malayanus', 'Honey Bear', 'Mammals',
   'Animalia', 'Chordata', 'Mammalia', 'Carnivora', 'Ursidae', 'Helarctos', 'malayanus',
   'Tropical forests', 'Omnivore', 65.0, 70.0, 25.0,
   'Vulnerable', 'The sun bear is the smallest bear species, native to Southeast Asia, known for its distinctive chest patch.',
   '{"Smallest bear in the world","Loves eating honey","Has the longest tongue of any bear species"}',
   'Daily at 8:00 AM and 4:00 PM', '/animals/sun-bear.jpg', true, 1200),
  ('Brahminy Kite', 'Haliastur indus', 'Lawin', 'Birds',
   'Animalia', 'Chordata', 'Aves', 'Accipitriformes', 'Accipitridae', 'Haliastur', 'indus',
   'Coastal areas and wetlands', 'Carnivore', 0.45, 48.0, 26.0,
   'Least Concern', 'A beautiful bird of prey with distinctive reddish-brown plumage and white head, common in Southeast Asia.',
   '{"Symbol of Langkawi island in Malaysia","Feeds mainly on fish","Sacred to Hindu communities"}',
   'Daily at 10:30 AM', '/animals/brahminy-kite.jpg', false, 450),
  ('Philippine Cockatoo', 'Cacatua haematuropygia', 'Kalangay', 'Birds',
   'Animalia', 'Chordata', 'Aves', 'Psittaciformes', 'Cacatuidae', 'Cacatua', 'haematuropygia',
   'Forests near water', 'Herbivore', 0.3, 32.0, 40.0,
   'Critically Endangered', 'The Philippine cockatoo is a critically endangered parrot endemic to the Philippines.',
   '{"Endemic to the Philippines","Highly intelligent and social","Can mimic human speech"}',
   'Daily at 9:30 AM', '/animals/philippine-cockatoo.jpg', false, 580),
  ('Common Tree Monitor', 'Varanus salvator', 'Bayawak', 'Reptiles',
   'Animalia', 'Chordata', 'Reptilia', 'Squamata', 'Varanidae', 'Varanus', 'salvator',
   'Forests and wetlands', 'Carnivore', 19.5, null, 12.0,
   'Least Concern', 'A large monitor lizard native to South and Southeast Asia, excellent swimmer and climber.',
   '{"Excellent swimmer and climber","Forked tongue detects prey","Common throughout Southeast Asia"}',
   'Tuesdays and Thursdays at 11:00 AM', '/animals/common-tree-monitor.jpg', false, 290),
  ('Asian Elephant', 'Elephas maximus', 'Elepante', 'Mammals',
   'Animalia', 'Chordata', 'Mammalia', 'Proboscidea', 'Elephantidae', 'Elephas', 'maximus',
   'Forests and grasslands', 'Herbivore', 5000.0, 280.0, 60.0,
   'Endangered', 'The Asian elephant is the largest land animal in Asia, known for its intelligence and social behavior.',
   '{"Largest land animal in Asia","Highly intelligent with strong memory","Live in matriarchal herds"}',
   'Daily at 8:30 AM and 3:30 PM', '/animals/asian-elephant.jpg', true, 1800)
) as v(name, scientific_name, common_name, category_name,
        kingdom, phylum, class, "order", family, genus, species,
        habitat, diet, weight_kg, height_cm, lifespan_years,
        conservation_status, description, interesting_facts,
        feeding_schedule, image_url, is_featured, view_count)
join cat_ids on cat_ids.name = v.category_name
on conflict do nothing;

-- Update animal location_id to point to relevant map pins
update public.animals set location_id = (
  select id from public.map_pins where name = 'African Savanna' limit 1
) where name in ('African Lion');

update public.animals set location_id = (
  select id from public.map_pins where name = 'Reptile House' limit 1
) where name in ('Reticulated Python', 'Saltwater Crocodile', 'Red-footed Tortoise', 'Common Tree Monitor');

update public.animals set location_id = (
  select id from public.map_pins where name = 'Bird Sanctuary' limit 1
) where name in ('Philippine Eagle', 'Brahminy Kite', 'Philippine Cockatoo');

update public.map_pins set animal_id = (
  select id from public.animals where name = 'African Lion' limit 1
) where name = 'African Savanna';

-- Update map_pins animal_id references
update public.map_pins set animal_id = (
  select id from public.animals where name = 'Philippine Eagle' limit 1
) where name = 'Bird Sanctuary';

-- FAQ seed data
insert into public.faq (question, answer, category, language) values
  ('What are the zoo opening hours?', 'Manila Zoo is open every day.
• Tuesdays to Sundays: 9:00 AM – 8:00 PM
• Holidays: 9:00 AM – 8:00 PM
• Mondays (including Monday holidays): 11:00 AM – 8:00 PM
Last entry of visitors is at 6:00 PM.', 'general', 'en'),
  ('How much are the admission tickets?', 'Admission rates (updated September 14, 2023), Manila residents / non-Manila residents:
• Adults and children 3 years old and above: ₱150 / ₱300
• Students: ₱100 / ₱200
• Senior citizens and PWDs (20% discount): ₱120 / ₱240
• Children 2 years old and below: free (no registration needed)
• Manila LGU employees and teachers under the Manila Division of City Schools: ₱100
Senior citizens of Manila with a valid OSCA ID visit free every Wednesday.
Discounted visitors must show a valid ID at the entrance (Manila residents: an ID with a Manila address).', 'tickets', 'en'),
  ('Is there parking available?', 'Yes, parking is available at the main entrance along Adriatico Street, Malate, Manila.', 'facilities', 'en'),
  ('Where are the restrooms located?', 'Restrooms are located near the main entrance, central plaza, and near the bird sanctuary.', 'facilities', 'en'),
  ('Are strollers allowed inside?', 'Yes, strollers are allowed inside the zoo. The pathways are accessible for strollers and wheelchairs.', 'accessibility', 'en'),
  ('Can I bring outside food?', 'Guests may bring light snacks. However, alcoholic beverages and glass containers are not permitted.', 'general', 'en'),
  ('Anong oras bukas ang Manila Zoo?', 'Bukas ang Manila Zoo araw-araw.
• Martes hanggang Linggo: 9:00 AM – 8:00 PM
• Mga holiday: 9:00 AM – 8:00 PM
• Lunes (kasama ang holiday na tumapat sa Lunes): 11:00 AM – 8:00 PM
Ang huling pagpasok ng mga bisita ay 6:00 PM.', 'general', 'fil'),
  ('Magkano ang ticket sa Manila Zoo?', 'Presyo ng pagpasok (na-update noong Setyembre 14, 2023), residente ng Maynila / hindi residente ng Maynila:
• Matatanda at mga batang 3 taong gulang pataas: ₱150 / ₱300
• Mga estudyante: ₱100 / ₱200
• Senior citizen at PWD (20% diskwento): ₱120 / ₱240
• Mga batang 2 taong gulang pababa: libre (hindi kailangang magparehistro)
• Mga empleyado ng Manila LGU at guro sa ilalim ng Manila Division of City Schools: ₱100
Libre ang mga senior citizen ng Maynila na may valid OSCA ID tuwing Miyerkules.
Paalala: Ang mga may diskwentong bisita ay kinakailangang magpakita ng kanilang valid ID bago pumasok ng Manila Zoo.', 'tickets', 'fil'),
  ('Saan matatagpuan ang comfort rooms?', 'Ang mga comfort room ay matatagpuan malapit sa main entrance, central plaza, at malapit sa bird sanctuary.', 'facilities', 'fil'),
  ('Maaari bang magdala ng pagkain sa loob?', 'Maaaring magdala ng magaang na merienda. Ipinagbabawal ang mga alcoholic beverages at glass containers.', 'general', 'fil')
on conflict do nothing;

-- Announcements seed
insert into public.announcements (title, content, type, is_active) values
  ('Welcome to Manila Zoo!', 'Experience the wonders of wildlife in the heart of Manila. Use our interactive map to explore!', 'info', true),
  ('New Animal Exhibit Opening', 'Visit our newly renovated Reptile House with 5 new species!', 'success', true),
  ('Zoo Hours Notice', 'The zoo will be closed for maintenance every first Monday of the month.', 'warning', true)
on conflict do nothing;

-- Events seed
insert into public.events (title, description, start_date, end_date, location, is_active) values
  ('Animal Feeding Show', 'Watch our keepers feed the lions up close!', now() + interval '2 days', now() + interval '2 days' + interval '1 hour', 'African Savanna', true),
  ('Educational Talk: Philippine Eagles', 'Learn about the endangered Philippine Eagle and conservation efforts.', now() + interval '5 days', now() + interval '5 days' + interval '2 hours', 'Bird Sanctuary', true),
  ('Junior Zookeeper Day', 'Kids get to assist zookeepers in daily animal care activities.', now() + interval '7 days', now() + interval '7 days' + interval '3 hours', 'Education Center', true)
on conflict do nothing;

-- Training dataset seed
insert into public.training_dataset (input, output, intent, language) values
  ('Where is the lion?', 'The African Lion can be found at the African Savanna exhibit. Check the interactive map for directions.', 'navigation', 'en'),
  ('What time does the zoo open?', 'Manila Zoo is open every day.
• Tuesdays to Sundays: 9:00 AM – 8:00 PM
• Holidays: 9:00 AM – 8:00 PM
• Mondays (including Monday holidays): 11:00 AM – 8:00 PM
Last entry of visitors is at 6:00 PM.', 'zoo_hours', 'en'),
  ('Saan ang banyo?', 'Ang mga comfort room ay matatagpuan malapit sa main entrance, central plaza, at malapit sa bird sanctuary.', 'facilities', 'fil'),
  ('How much is the ticket?', 'Admission rates (updated September 14, 2023), Manila residents / non-Manila residents:
• Adults and children 3 years old and above: ₱150 / ₱300
• Students: ₱100 / ₱200
• Senior citizens and PWDs (20% discount): ₱120 / ₱240
• Children 2 years old and below: free (no registration needed)
• Manila LGU employees and teachers under the Manila Division of City Schools: ₱100
Senior citizens of Manila with a valid OSCA ID visit free every Wednesday.
Discounted visitors must show a valid ID at the entrance (Manila residents: an ID with a Manila address).', 'tickets', 'en'),
  ('Anong oras bukas?', 'Bukas ang Manila Zoo araw-araw.
• Martes hanggang Linggo: 9:00 AM – 8:00 PM
• Mga holiday: 9:00 AM – 8:00 PM
• Lunes (kasama ang holiday na tumapat sa Lunes): 11:00 AM – 8:00 PM
Ang huling pagpasok ng mga bisita ay 6:00 PM.', 'zoo_hours', 'fil')
on conflict do nothing;
