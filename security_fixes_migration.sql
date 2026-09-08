-- ==============================================================================
-- STANDALONE SECURITY FIXES MIGRATION
-- Run this script directly against your live Supabase project SQL Editor.
-- This script hardens RLS policies and provisions the secure redemption RPC.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CRITICAL FIX: PROFILES SELECT POLICY (Fixes cross-tenant data leak)
-- Restrict profiles SELECT so only the authenticated user or an admin can read
-- profile details (email, subscription status, trial dates, etc.).
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" 
ON public.profiles FOR SELECT 
TO authenticated
USING ( auth.uid() = id OR is_admin() );

-- ------------------------------------------------------------------------------
-- 2. HIGH FIX: PROFILES UPDATE POLICY (Fixes self-extending subscriptions)
-- Prevent authenticated users from modifying subscription_end, trial_start, or
-- trial_end to bypass trial/subscription expiration gates via devtools.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" 
ON public.profiles FOR UPDATE 
TO authenticated
USING ( auth.uid() = id )
WITH CHECK (
  (is_admin()) OR (
    -- Users can only update their own display_name, avatar_url, and preferences.
    -- Verify sensitive privilege, subscription status, and trial dates remain unchanged:
    role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) AND 
    is_subscribed IS NOT DISTINCT FROM (SELECT p.is_subscribed FROM public.profiles p WHERE p.id = auth.uid()) AND
    subscription_tier IS NOT DISTINCT FROM (SELECT p.subscription_tier FROM public.profiles p WHERE p.id = auth.uid()) AND
    subscription_end IS NOT DISTINCT FROM (SELECT p.subscription_end FROM public.profiles p WHERE p.id = auth.uid()) AND
    trial_start IS NOT DISTINCT FROM (SELECT p.trial_start FROM public.profiles p WHERE p.id = auth.uid()) AND
    trial_end IS NOT DISTINCT FROM (SELECT p.trial_end FROM public.profiles p WHERE p.id = auth.uid())
  )
);

-- Ensure admin policy on profiles is active
DROP POLICY IF EXISTS "Admin Master Control Profiles" ON public.profiles;
CREATE POLICY "Admin Master Control Profiles" 
ON public.profiles FOR ALL 
TO authenticated
USING ( is_admin() )
WITH CHECK ( is_admin() );

-- ------------------------------------------------------------------------------
-- 3. CRITICAL FIX: ACCESS KEY THEFT CHAIN & ATOMIC REDEMPTION RPC
-- Remove permissive policies that allowed scanning unredeemed keys (is_used = false)
-- and self-binding them. Switch redemption to an atomic SECURITY DEFINER RPC.
-- ------------------------------------------------------------------------------
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Ghost Key Discovery" ON public.access_keys;
DROP POLICY IF EXISTS "Secure Key Binding" ON public.access_keys;

-- Users can only view keys already bound to their own account
DROP POLICY IF EXISTS "Users view own bound keys" ON public.access_keys;
CREATE POLICY "Users view own bound keys" 
ON public.access_keys FOR SELECT 
TO authenticated
USING ( user_id = auth.uid() OR is_admin() );

-- Admins retain full control
DROP POLICY IF EXISTS "Admin Master Control Keys" ON public.access_keys;
CREATE POLICY "Admin Master Control Keys"
ON public.access_keys FOR ALL
TO authenticated
USING ( is_admin() )
WITH CHECK ( is_admin() );

-- Secure atomic key redemption RPC
CREATE OR REPLACE FUNCTION public.redeem_access_key(
  key_code TEXT,
  device_id_input TEXT DEFAULT NULL,
  target_tool_input TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_key RECORD;
  v_clean_key TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to redeem access key.';
  END IF;

  v_clean_key := upper(trim(key_code));
  IF v_clean_key IS NULL OR v_clean_key = '' THEN
    RAISE EXCEPTION 'Please provide a valid access key.';
  END IF;

  -- Atomically lookup the key by exact string
  SELECT * INTO v_key
  FROM public.access_keys
  WHERE key = v_clean_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid access key. Please check the code and try again.';
  END IF;

  -- If target_tool is specified, verify tool compatibility
  IF target_tool_input IS NOT NULL AND target_tool_input <> '' THEN
    IF v_key.tool <> target_tool_input AND v_key.tool <> 'universal' THEN
      RAISE EXCEPTION 'This key is not valid for the requested tool.';
    END IF;
  END IF;

  -- Check if already bound to another user account
  IF v_key.is_used AND v_key.user_id IS NOT NULL AND v_key.user_id <> v_user_id THEN
    RAISE EXCEPTION 'This key is already bound to another user account.';
  END IF;

  -- Bind or re-bind to current user & device
  UPDATE public.access_keys
  SET 
    is_used = true,
    used_at = now(),
    user_id = v_user_id,
    device_id = COALESCE(device_id_input, v_key.device_id)
  WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_key.id,
    'tool', v_key.tool,
    'is_used', true,
    'message', 'Key redeemed successfully'
  );
END;
$$;

-- Restrict execution to authenticated users
REVOKE EXECUTE ON FUNCTION public.redeem_access_key(TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_access_key(TEXT, TEXT, TEXT) TO authenticated;

-- Reload schema cache in PostgREST
NOTIFY pgrst, 'reload schema';
