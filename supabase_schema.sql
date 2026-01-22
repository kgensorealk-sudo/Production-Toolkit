
-- PRODUCTION TOOLKIT: DATABASE SECURITY REFINEMENT
-- Execute this to prevent users from bypassing subscriptions.

-- 1. DROP VULNERABLE POLICY
drop policy if exists "Users update own profile" on public.profiles;

-- 2. CREATE SECURE UPDATE POLICY
-- Users can only update their own record, but we check if they are trying to change sensitive columns via a trigger or specific logic.
-- However, the simplest RLS approach for Supabase is to only allow Admins to touch the status columns.
create policy "Users update own heartbeat" 
on public.profiles 
for update 
using ( auth.uid() = id )
with check (
  -- This prevents users from changing their own role or subscription status
  (role = (select role from public.profiles where id = auth.uid())) AND
  (is_subscribed = (select is_subscribed from public.profiles where id = auth.uid())) AND
  (subscription_end = (select subscription_end from public.profiles where id = auth.uid()))
);

-- 3. ENSURE ADMINS HAVE TOTAL CONTROL
drop policy if exists "Admins update all profiles" on public.profiles;
create policy "Admins update all profiles" 
on public.profiles 
for update 
using ( is_admin() );

-- 4. SYSTEM SETTINGS INTEGRITY
-- Ensure users cannot touch global free tool settings
drop policy if exists "Admins manage settings" on public.system_settings;
create policy "Admins manage settings" 
on public.system_settings 
for all 
using ( is_admin() );
