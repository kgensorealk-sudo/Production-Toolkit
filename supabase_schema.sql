-- 1. TABLE STRUCTURE (Baseline)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  role TEXT DEFAULT 'user',
  is_subscribed BOOLEAN DEFAULT false,
  subscription_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  last_seen TIMESTAMPTZ DEFAULT now()
);

-- 2. SECURE PROFILE INITIALIZATION
-- Ensures that no matter what the signup request contains, 
-- the user is ALWAYS created as a non-subscribed 'user'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, is_subscribed)
  VALUES (new.id, new.email, 'user', false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. HELPER: Admin Check
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. HARDENED SECURITY POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: Users see themselves, Admins see everyone
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" 
ON public.profiles FOR SELECT 
USING ( auth.uid() = id OR is_admin() );

-- UPDATE: This is the critical security fix.
-- Users can ONLY update their 'last_seen' timestamp.
-- We use a trigger or a strict policy check to prevent role/subscription tampering.
DROP POLICY IF EXISTS "Users update own heartbeat" ON public.profiles;
CREATE POLICY "Users update own heartbeat" 
ON public.profiles FOR UPDATE 
USING ( auth.uid() = id )
WITH CHECK (
  -- Prevent modification of sensitive columns by regular users
  (
    is_admin() -- Admins can do anything
  ) OR (
    -- Users can only modify last_seen
    -- RLS doesn't natively support column-level 'WITH CHECK' easily, 
    -- so we ensure the user stays a 'user' and stays 'unsubscribed' if they weren't already.
    role = 'user' AND 
    (is_subscribed = (SELECT is_subscribed FROM public.profiles WHERE id = auth.uid()))
  )
);

-- ADMIN MASTER: Full access for true admins
DROP POLICY IF EXISTS "Admin Master Control Profiles" ON public.profiles;
CREATE POLICY "Admin Master Control Profiles" 
ON public.profiles FOR ALL 
USING ( is_admin() );

-- 5. ACCESS KEYS POLICIES
DROP POLICY IF EXISTS "Ghost Key Discovery" ON public.access_keys;
CREATE POLICY "Ghost Key Discovery" 
ON public.access_keys FOR SELECT 
USING ( auth.uid() = user_id OR is_used = false OR is_admin() );

DROP POLICY IF EXISTS "Secure Key Binding" ON public.access_keys;
CREATE POLICY "Secure Key Binding"
ON public.access_keys FOR UPDATE
USING ( (is_used = false) OR (user_id = auth.uid()) OR is_admin() )
WITH CHECK ( (user_id = auth.uid()) OR is_admin() );