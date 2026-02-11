
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

-- 4. ACCESS KEYS TABLE
CREATE TABLE IF NOT EXISTS public.access_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  tool TEXT NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  user_id UUID REFERENCES public.profiles(id),
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TOOL TIPS TABLE
CREATE TABLE IF NOT EXISTS public.tool_tips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  author_id UUID REFERENCES public.profiles(id)
);

-- 8. SYSTEM SETTINGS (Global Config)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  free_tools_data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. TELEMETRY LOGS
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Insert global record if not exists
INSERT INTO public.system_settings (id, free_tools_data)
VALUES ('global', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 2. SECURE PROFILE INITIALIZATION
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

DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" 
ON public.profiles FOR SELECT 
USING ( auth.uid() = id OR is_admin() );

DROP POLICY IF EXISTS "Users update own heartbeat" ON public.profiles;
CREATE POLICY "Users update own heartbeat" 
ON public.profiles FOR UPDATE 
USING ( auth.uid() = id )
WITH CHECK (
  (is_admin()) OR (
    role = 'user' AND 
    (is_subscribed = (SELECT is_subscribed FROM public.profiles WHERE id = auth.uid()))
  )
);

DROP POLICY IF EXISTS "Admin Master Control Profiles" ON public.profiles;
CREATE POLICY "Admin Master Control Profiles" 
ON public.profiles FOR ALL 
USING ( is_admin() );

-- 5. ACCESS KEYS POLICIES
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ghost Key Discovery" ON public.access_keys;
CREATE POLICY "Ghost Key Discovery" 
ON public.access_keys FOR SELECT 
TO authenticated
USING ( user_id = auth.uid() OR is_used = false OR is_admin() );

DROP POLICY IF EXISTS "Secure Key Binding" ON public.access_keys;
CREATE POLICY "Secure Key Binding"
ON public.access_keys FOR UPDATE
TO authenticated
USING ( is_used = false OR user_id = auth.uid() OR is_admin() )
WITH CHECK ( user_id = auth.uid() OR is_admin() );

DROP POLICY IF EXISTS "Admin Master Control Keys" ON public.access_keys;
CREATE POLICY "Admin Master Control Keys"
ON public.access_keys FOR ALL
TO authenticated
USING ( is_admin() )
WITH CHECK ( is_admin() );

-- 7. TOOL TIPS POLICIES
ALTER TABLE public.tool_tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tips visible to all" ON public.tool_tips;
CREATE POLICY "Tips visible to all" 
ON public.tool_tips FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage tips" ON public.tool_tips;
CREATE POLICY "Admins manage tips" 
ON public.tool_tips FOR ALL 
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 9. SYSTEM SETTINGS POLICIES
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System config visible to all nodes" ON public.system_settings;
CREATE POLICY "System config visible to all nodes" 
ON public.system_settings FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins control system config" ON public.system_settings;
CREATE POLICY "Admins control system config" 
ON public.system_settings FOR ALL 
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 11. USAGE LOGS POLICIES
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users record telemetry" ON public.usage_logs;
CREATE POLICY "Users record telemetry" 
ON public.usage_logs FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view telemetry" ON public.usage_logs;
CREATE POLICY "Admins view telemetry" 
ON public.usage_logs FOR SELECT 
TO authenticated
USING (is_admin());
