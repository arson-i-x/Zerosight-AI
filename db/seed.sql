-- Enable UUID generator if missing
create extension if not exists pgcrypto;

-- Application-level profiles table (link to Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  contact text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Optionally create a trigger to keep updated_at current
create or replace function profiles_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function profiles_updated_at();

-- Pending profiles table for email/phone confirmation
create table if not exists pending_profiles (
  id uuid primary key default gen_random_uuid(),
  contact text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '24 hours'
);

create index if not exists idx_pending_profiles_contact on pending_profiles (contact);

-- Device credentials table (pre-populated, for device authentication)
create table if not exists device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_uuid text unique not null,
  api_key text unique not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  claimed boolean default false
);

create index if not exists idx_device_credentials_api_key on device_credentials (api_key);
create index if not exists idx_device_credentials_device_uuid on device_credentials (device_uuid);

-- Devices table (user-claimed devices)
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  device_credential_id uuid references device_credentials(id),
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz default now()
);

create index if not exists idx_devices_user_id on devices (user_id);
create index if not exists idx_devices_device_credential_id on devices (device_credential_id);

ALTER TABLE devices
  ADD CONSTRAINT devices_device_credential_id_key
  UNIQUE (device_credential_id);

-- Events table
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(device_credential_id) on delete cascade,
  event_type text not null,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_events_device_id on events (device_id);
create index if not exists idx_events_user_id on events (user_id);

-- Face encodings (stored as encrypted text blob)
create table if not exists face_encodings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  encoding text not null,
  created_at timestamptz default now()
);

create index if not exists idx_face_encodings_user_id on face_encodings (user_id);

-- Refresh tokens (opaque tokens stored hashed) -- server-only table, do NOT enable RLS
create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked boolean default false,
  rotated_from uuid references refresh_tokens(id),
  created_at timestamptz default now()
);

create index if not exists idx_refresh_tokens_token_hash on refresh_tokens (token_hash);
create index if not exists idx_refresh_tokens_user_id on refresh_tokens (user_id);


-- RLS NOT USED


-- Enable Row-Level Security where appropriate
alter table events enable row level security;
alter table devices enable row level security;
alter table face_encodings enable row level security;

-- Policies for events
create policy "Users read own events"
  on events for select
  using (auth.uid() = user_id);

create policy "Users insert own events"
  on events for insert
  with check (auth.uid() = user_id);

-- Policies for devices
create policy "Users read own devices"
  on devices for select
  using (auth.uid() = user_id);

create policy "Users insert own devices"
  on devices for insert
  with check (auth.uid() = user_id);

-- Policies for face_encodings
create policy "Users read own face_encodings"
  on face_encodings for select
  using (auth.uid() = user_id);

create policy "Users insert own face_encodings"
  on face_encodings for insert
  with check (auth.uid() = user_id);