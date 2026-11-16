-- WARDROBE — database schema for Supabase (Postgres).
-- Run once in the Supabase SQL editor of a fresh project.
--
-- Access model: the Next.js server is the only client. It uses the service-role key and
-- scopes every query to the unlocked profile. Row Level Security is enabled on every table
-- WITHOUT policies, so the public anon key can read or write nothing at all.

create table if not exists accounts (
  id uuid primary key,
  password_hash text not null,
  session_version integer not null default 1,
  created_at timestamptz not null default now(),
  singleton boolean not null default true unique check (singleton) -- exactly one household
);

create table if not exists profiles (
  id uuid primary key,
  account_id uuid not null references accounts (id) on delete cascade,
  slug text not null check (slug in ('kole', 'alisha')),
  name text not null,
  pin_hash text not null,
  pin_changed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id, slug)
);

create table if not exists user_preferences (
  profile_id uuid primary key references profiles (id) on delete cascade,
  use_location boolean not null default true,
  city text,
  lat double precision,
  lon double precision,
  favorite_styles text[] not null default '{}'
);

create table if not exists custom_categories (
  id uuid primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  item_group text not null
);

create table if not exists clothing_items (
  id uuid primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  item_group text not null,
  type text not null,
  slot text not null,
  colors text[] not null default '{}',
  pattern text,
  material text,
  seasons text[] not null default '{}',
  styles text[] not null default '{}',
  tags text[] not null default '{}',
  favorite boolean not null default false,
  wear_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists clothing_items_profile on clothing_items (profile_id);

create table if not exists clothing_images (
  id uuid primary key,
  item_id uuid not null references clothing_items (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  path text not null unique,
  width integer not null,
  height integer not null,
  content_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists clothing_images_profile on clothing_images (profile_id);

create table if not exists outfits (
  id uuid primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  styles text[] not null default '{}',
  season text,
  occasion text,
  note text,
  favorite boolean not null default false,
  worn_count integer not null default 0,
  weather jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outfits_profile on outfits (profile_id);

create table if not exists outfit_items (
  outfit_id uuid not null references outfits (id) on delete cascade,
  item_id uuid not null references clothing_items (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  slot text not null,
  position integer not null default 0,
  primary key (outfit_id, item_id)
);
create index if not exists outfit_items_profile on outfit_items (profile_id);

create table if not exists boards (
  id uuid primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists boards_profile on boards (profile_id);

create table if not exists board_outfits (
  board_id uuid not null references boards (id) on delete cascade,
  outfit_id uuid not null references outfits (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  primary key (board_id, outfit_id)
);
create index if not exists board_outfits_profile on board_outfits (profile_id);

-- failed-attempt counters for login and PIN (timestamps in epoch milliseconds)
create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start bigint not null default 0,
  lockouts integer not null default 0,
  locked_until bigint not null default 0
);

alter table accounts enable row level security;
alter table profiles enable row level security;
alter table user_preferences enable row level security;
alter table custom_categories enable row level security;
alter table clothing_items enable row level security;
alter table clothing_images enable row level security;
alter table outfits enable row level security;
alter table outfit_items enable row level security;
alter table boards enable row level security;
alter table board_outfits enable row level security;
alter table rate_limits enable row level security;

-- private bucket for clothing photos; no storage policies = no public or anon access
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe', 'wardrobe', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
