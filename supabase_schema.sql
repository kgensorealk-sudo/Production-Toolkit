
-- 1. BASELINE PROFILES
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

-- 2. SYSTEM SETTINGS (Consolidated Matrix)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  free_tools_data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- MIGRATION: Add tool_access_configs column if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.system_settings'::regclass AND attname = 'tool_access_configs') THEN
        ALTER TABLE public.system_settings ADD COLUMN tool_access_configs JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Ensure a global configuration row exists for the dashboard to target
INSERT INTO public.system_settings (id, free_tools_data, tool_access_configs) 
VALUES ('global', '{}'::jsonb, '{}'::jsonb) 
ON CONFLICT (id) DO NOTHING;

-- 3. ACCESS KEYS
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

-- 4. USAGE LOGS (Telemetry)
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id),
  tool_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- 5. ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. SECURITY: RLS POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Helper: Admin Check
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT (email = 'generalkevin53@gmail.com' OR role = 'admin')
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Settings Policies
DROP POLICY IF EXISTS "Public read config" ON public.system_settings;
CREATE POLICY "Public read config" ON public.system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manage config" ON public.system_settings;
CREATE POLICY "Admin manage config" ON public.system_settings FOR ALL USING ( is_admin() );

-- Profiles Policies
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING ( auth.uid() = id OR is_admin() );

DROP POLICY IF EXISTS "Admin Master Control Profiles" ON public.profiles;
CREATE POLICY "Admin Master Control Profiles" ON public.profiles FOR ALL USING ( is_admin() );

-- Usage Logs Policies
DROP POLICY IF EXISTS "Users can log their own usage" ON public.usage_logs;
CREATE POLICY "Users can log their own usage" ON public.usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all logs" ON public.usage_logs;
CREATE POLICY "Admins can view all logs" ON public.usage_logs FOR SELECT USING (is_admin());
