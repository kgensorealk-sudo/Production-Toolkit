
-- PRODUCTION TOOLKIT: DATABASE REPAIR & SETUP
-- Execute this in Supabase SQL Editor to fix permissions and tables.

-- ==========================================
-- 1. HELPER FUNCTION (Fixes Admin Permissions)
-- ==========================================
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 
    from public.profiles 
    where id = auth.uid() 
    and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- ==========================================
-- 2. PROFILES TABLE
-- ==========================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'user',
  is_subscribed boolean default false,
  subscription_end timestamp with time zone,
  trial_start timestamp with time zone,
  trial_end timestamp with time zone,
  last_seen timestamp with time zone default now()
);

alter table profiles enable row level security;

drop policy if exists "Users view own profile" on profiles;
create policy "Users view own profile" on profiles for select using ( auth.uid() = id );

drop policy if exists "Users update own profile" on profiles;
create policy "Users update own profile" on profiles for update using ( auth.uid() = id );

drop policy if exists "Admins view all profiles" on profiles;
create policy "Admins view all profiles" on profiles for select using ( is_admin() );

drop policy if exists "Admins update all profiles" on profiles;
create policy "Admins update all profiles" on profiles for update using ( is_admin() );

-- ==========================================
-- 3. SYSTEM SETTINGS (Global Tool Control with Auto-Expiry)
-- ==========================================
create table if not exists public.system_settings (
  id text primary key default 'global',
  free_tools text[] default '{}',
  free_tools_data jsonb default '{}'::jsonb, -- Stores { tool_id: expiry_iso_string }
  updated_at timestamp with time zone default now()
);

-- MIGRATION: Ensure column exists if table was created in an older version
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_settings' AND column_name='free_tools_data') THEN
    ALTER TABLE public.system_settings ADD COLUMN free_tools_data jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Seed global settings if not exists
insert into public.system_settings (id, free_tools, free_tools_data)
values ('global', '{}', '{}'::jsonb)
on conflict (id) do nothing;

alter table system_settings enable row level security;

drop policy if exists "Anyone can read settings" on system_settings;
create policy "Anyone can read settings" on system_settings for select using (true);

drop policy if exists "Admins manage settings" on system_settings;
create policy "Admins manage settings" on system_settings for all using (is_admin());

-- ==========================================
-- 4. ANNOUNCEMENTS TABLE
-- ==========================================
create table if not exists public.announcements (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null,
  type text default 'info',
  is_active boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table announcements enable row level security;

drop policy if exists "Public read active announcements" on announcements;
create policy "Public read active announcements" on announcements for select using ( is_active = true );

drop policy if exists "Admins select announcements" on announcements;
create policy "Admins select announcements" on announcements for select using ( is_admin() );

drop policy if exists "Admins insert announcements" on announcements;
create policy "Admins insert announcements" on announcements for insert with check ( is_admin() );

drop policy if exists "Admins update announcements" on announcements;
create policy "Admins update announcements" on announcements for update using ( is_admin() );

drop policy if exists "Admins delete announcements" on announcements;
create policy "Admins delete announcements" on announcements for delete using ( is_admin() );

-- ==========================================
-- 5. ACCESS KEYS (Hardware Locking)
-- ==========================================
create table if not exists public.access_keys (
  id uuid default gen_random_uuid() primary key,
  key text unique not null,
  tool text not null,
  is_used boolean default false,
  used_at timestamp with time zone,
  user_id uuid references public.profiles on delete set null, -- Link to profiles for email lookup
  device_id text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table access_keys enable row level security;

drop policy if exists "Read keys" on access_keys;
create policy "Read keys" on access_keys for select using (true);

drop policy if exists "Admins manage keys" on access_keys;
create policy "Admins manage keys" on access_keys for all using (is_admin());

drop policy if exists "Users update used keys" on access_keys;
create policy "Users update used keys" on access_keys for update using (auth.uid() = user_id or (is_used = false));

-- ==========================================
-- 6. TRIGGER FOR NEW USERS
-- ==========================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, is_subscribed, trial_start, trial_end, subscription_end, last_seen)
  values (new.id, new.email, false, null, null, null, now());
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();