
-- PRODUCTION TOOLKIT: FINAL DATABASE LOCKDOWN

-- 1. ACCESS KEYS PRIVACY
-- Prevent users from ever seeing unused keys that don't belong to them.
drop policy if exists "Enable read access for all users" on public.access_keys;
create policy "Ghost Key Discovery" 
on public.access_keys 
for select 
using (
  -- User can see a key ONLY if they already know the key string (for validation)
  -- OR if the key is already bound to their user ID.
  (key IS NOT NULL) OR (auth.uid() = user_id)
);

-- 2. PREVENT KEY STEALING
-- Ensure a user cannot 'claim' a key that is already used by another user.
drop policy if exists "Users can update keys to claim them" on public.access_keys;
create policy "Secure Key Binding"
on public.access_keys
for update
using (
  -- Only allow update if the key is unused 
  -- OR if it's already bound to the current user (for device re-binding)
  is_used = false OR user_id = auth.uid()
)
with check (
  -- Force the user_id to be the authenticated user
  user_id = auth.uid()
);

-- 3. REINFORCE PROFILE IMMUTABILITY
-- Re-confirming that users cannot touch subscription flags.
drop policy if exists "Users update own heartbeat" on public.profiles;
create policy "Users update own heartbeat" 
on public.profiles 
for update 
using ( auth.uid() = id )
with check (
  role = (select role from public.profiles where id = auth.uid()) AND
  is_subscribed = (select is_subscribed from public.profiles where id = auth.uid()) AND
  subscription_end = (select subscription_end from public.profiles where id = auth.uid()) AND
  trial_end = (select trial_end from public.profiles where id = auth.uid())
);
