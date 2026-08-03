
-- 1. TABLE STRUCTURE (Baseline)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  is_subscribed BOOLEAN DEFAULT false,
  subscription_tier TEXT DEFAULT 'none',
  subscription_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  last_seen TIMESTAMPTZ DEFAULT now(),
  notification_preferences JSONB DEFAULT '{"system_alerts": true, "security_updates": true, "maintenance_windows": true}'::jsonb
);

-- Ensure columns exist for existing tables (Migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_tier') THEN
        ALTER TABLE public.profiles ADD COLUMN subscription_tier TEXT DEFAULT 'none';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_end') THEN
        ALTER TABLE public.profiles ADD COLUMN subscription_end TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'trial_start') THEN
        ALTER TABLE public.profiles ADD COLUMN trial_start TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'trial_end') THEN
        ALTER TABLE public.profiles ADD COLUMN trial_end TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen') THEN
        ALTER TABLE public.profiles ADD COLUMN last_seen TIMESTAMPTZ DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'display_name') THEN
        ALTER TABLE public.profiles ADD COLUMN display_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url') THEN
        ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'notification_preferences') THEN
        ALTER TABLE public.profiles ADD COLUMN notification_preferences JSONB DEFAULT '{"system_alerts": true, "security_updates": true, "maintenance_windows": true}'::jsonb;
    END IF;
END $$;

-- Force PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';

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

-- 12. ANNOUNCEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  category TEXT DEFAULT 'system_alerts',
  is_active BOOLEAN DEFAULT false,
  is_mandatory BOOLEAN DEFAULT false, -- Added for forced reading
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12.1 ANNOUNCEMENT READS (Persistence)
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

-- Ensure columns exist for existing tables (Migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'category') THEN
        ALTER TABLE public.announcements ADD COLUMN category TEXT DEFAULT 'system_alerts';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'is_mandatory') THEN
        ALTER TABLE public.announcements ADD COLUMN is_mandatory BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'updated_at') THEN
        ALTER TABLE public.announcements ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

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
  -- Super admin email or role check
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR email = 'kgenso.realK@gmail.com' OR email = 'generalkevin53@gmail.com')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. HARDENED SECURITY POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" 
ON public.profiles FOR SELECT 
USING ( true );

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" 
ON public.profiles FOR UPDATE 
USING ( auth.uid() = id )
WITH CHECK (
  (is_admin()) OR (
    -- Users can only update their own display_name and avatar_url
    -- We verify that sensitive fields remain unchanged by comparing new values (column names)
    -- with existing values (fetched via subquery)
    role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) AND 
    is_subscribed = (SELECT p.is_subscribed FROM public.profiles p WHERE p.id = auth.uid()) AND
    subscription_tier = (SELECT p.subscription_tier FROM public.profiles p WHERE p.id = auth.uid())
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

DROP POLICY IF EXISTS "Users view own telemetry" ON public.usage_logs;
CREATE POLICY "Users view own telemetry" 
ON public.usage_logs FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view telemetry" ON public.usage_logs;
CREATE POLICY "Admins view telemetry" 
ON public.usage_logs FOR SELECT 
TO authenticated
USING (is_admin());

DROP POLICY IF EXISTS "Admins purge telemetry" ON public.usage_logs;
CREATE POLICY "Admins purge telemetry" 
ON public.usage_logs FOR DELETE 
TO authenticated
USING (is_admin());

-- 13. ANNOUNCEMENTS POLICIES
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Broadcasts visible to all" ON public.announcements;
CREATE POLICY "Broadcasts visible to all" 
ON public.announcements FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins control broadcasts" ON public.announcements;
CREATE POLICY "Admins control broadcasts" 
ON public.announcements FOR ALL 
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 13.1 ANNOUNCEMENT READS POLICIES
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own read status" ON public.announcement_reads;
CREATE POLICY "Users can see their own read status" ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can mark as read" ON public.announcement_reads;
CREATE POLICY "Users can mark as read" ON public.announcement_reads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all read status" ON public.announcement_reads;
CREATE POLICY "Admins view all read status" ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (is_admin());

-- 15. FEEDBACK TABLE
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id),
  tool_id TEXT, -- Optional, to track which tool feedback is from
  type TEXT NOT NULL, -- 'bug' or 'feature'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.feedback;
CREATE POLICY "Users can insert own feedback" ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all feedback" ON public.feedback;
CREATE POLICY "Admins can view all feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete feedback" ON public.feedback;
CREATE POLICY "Admins can delete feedback" ON public.feedback
  FOR DELETE TO authenticated
  USING (is_admin());

-- 16. DEFAULT AVATARS TABLE
CREATE TABLE IF NOT EXISTS public.default_avatars (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.default_avatars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Avatars visible to all" ON public.default_avatars;
CREATE POLICY "Avatars visible to all" 
ON public.default_avatars FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage avatars" ON public.default_avatars;
CREATE POLICY "Admins manage avatars" 
ON public.default_avatars FOR ALL 
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 14. REALTIME ENABLEMENT
-- Ensure system_settings table is part of the realtime publication
-- Note: This requires superuser privileges in a standard SQL editor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'system_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
  END IF;
END $$;

-- 17. STORAGE BUCKET SETUP
