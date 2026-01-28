
-- 1. TABLE STRUCTURE (Ensure columns exist)
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

-- 2. AUTOMATIC PROFILE CREATION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. RECURSION FIX: Helper function to check admin status
-- This bypasses RLS because it is SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. HARDENED SECURITY POLICIES (Non-Recursive)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;

-- Select Policy: Users see themselves, Admins see everyone
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" 
ON public.profiles FOR SELECT 
USING ( auth.uid() = id OR is_admin() );

-- Admin Master Policy: Full access if is_admin() is true
DROP POLICY IF EXISTS "Admin Master Control Profiles" ON public.profiles;
CREATE POLICY "Admin Master Control Profiles" 
ON public.profiles FOR ALL 
USING ( is_admin() );

-- Heartbeat/Update Policy: Users can update their own last_seen
-- Note: We trust the app to only update permitted columns, 
-- or use a trigger for hard column-level locking.
DROP POLICY IF EXISTS "Users update own heartbeat" ON public.profiles;
CREATE POLICY "Users update own heartbeat" 
ON public.profiles FOR UPDATE 
USING ( auth.uid() = id )
WITH CHECK ( auth.uid() = id );

-- 5. ACCESS KEYS POLICIES
DROP POLICY IF EXISTS "Ghost Key Discovery" ON public.access_keys;
CREATE POLICY "Ghost Key Discovery" 
ON public.access_keys FOR SELECT 
USING ( auth.uid() = user_id OR is_used = false OR is_admin() );

DROP POLICY IF EXISTS "Secure Key Binding" ON public.access_keys;
CREATE POLICY "Secure Key Binding"
ON public.access_keys FOR UPDATE
USING ( is_used = false OR user_id = auth.uid() OR is_admin() )
WITH CHECK ( user_id = auth.uid() OR is_admin() );
