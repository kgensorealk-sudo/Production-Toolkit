
-- 1. TABLE STRUCTURE (Baseline)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  last_global_read_at TIMESTAMPTZ DEFAULT now(),
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
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_global_read_at') THEN
        ALTER TABLE public.profiles ADD COLUMN last_global_read_at TIMESTAMPTZ DEFAULT now();
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure category column exists (Migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'category') THEN
        ALTER TABLE public.announcements ADD COLUMN category TEXT DEFAULT 'system_alerts';
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

-- 3.1 HELPER: Channel Member Check
CREATE OR REPLACE FUNCTION public.is_channel_member(chan_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = chan_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.2 HELPER: Public Channel Check
CREATE OR REPLACE FUNCTION public.is_channel_public(chan_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.channels
    WHERE id = chan_id AND NOT is_private
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
-- Note: This requires the storage schema to exist (default in Supabase)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 19. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL for global/channel chat
  channel_id UUID, -- Added for channel support
  content TEXT NOT NULL,
  file_url TEXT, -- Added for file uploads
  file_name TEXT, -- Added for file uploads
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist for messages (Migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'receiver_id') THEN
        ALTER TABLE public.messages ADD COLUMN receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'channel_id') THEN
        ALTER TABLE public.messages ADD COLUMN channel_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'file_url') THEN
        ALTER TABLE public.messages ADD COLUMN file_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'file_name') THEN
        ALTER TABLE public.messages ADD COLUMN file_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'notes') THEN
        ALTER TABLE public.channels ADD COLUMN notes TEXT;
    END IF;
END $$;

-- 21. CHANNELS TABLE
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  is_private BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 22. CHANNEL MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.channel_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  role TEXT DEFAULT 'member', -- 'member', 'admin'
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Ensure columns exist for channel_members (Migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'channel_members' AND column_name = 'last_read_at') THEN
        ALTER TABLE public.channel_members ADD COLUMN last_read_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- Add foreign key to messages for channel_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_channel') THEN
        ALTER TABLE public.messages 
        ADD CONSTRAINT fk_messages_channel 
        FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 14. REALTIME ENABLEMENT
-- Enable Realtime for messages, channels, and channel_members
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'channels') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'channel_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members;
  END IF;
END $$;

-- 23. CHANNELS POLICIES
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public channels visible to all" ON public.channels;
CREATE POLICY "Public channels visible to all" ON public.channels
  FOR SELECT TO authenticated
  USING ( NOT is_private );

DROP POLICY IF EXISTS "Private channels visible to members" ON public.channels;
CREATE POLICY "Private channels visible to members" ON public.channels
  FOR SELECT TO authenticated
  USING ( 
    is_admin() OR
    (is_private AND is_channel_member(id))
  );

DROP POLICY IF EXISTS "Admins can create channels" ON public.channels;
CREATE POLICY "Admins can create channels" ON public.channels
  FOR INSERT TO authenticated
  WITH CHECK ( is_admin() );

DROP POLICY IF EXISTS "Admins can update channels" ON public.channels;
CREATE POLICY "Admins can update channels" ON public.channels
  FOR UPDATE TO authenticated
  USING ( is_admin() );

DROP POLICY IF EXISTS "Admins can delete channels" ON public.channels;
CREATE POLICY "Admins can delete channels" ON public.channels
  FOR DELETE TO authenticated
  USING ( is_admin() );

-- 24. CHANNEL MEMBERS POLICIES
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view channel members" ON public.channel_members;
CREATE POLICY "Members can view channel members" ON public.channel_members
  FOR SELECT TO authenticated
  USING ( 
    is_admin() OR
    is_channel_public(channel_id) OR
    is_channel_member(channel_id)
  );

DROP POLICY IF EXISTS "Admins can manage members" ON public.channel_members;
CREATE POLICY "Admins can manage members" ON public.channel_members
  FOR ALL TO authenticated
  USING ( is_admin() )
  WITH CHECK ( is_admin() );

-- Update messages policies for channels
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "Users can view their own messages" 
ON public.messages FOR SELECT 
TO authenticated
USING ( 
  is_admin() OR
  auth.uid() = sender_id OR
  auth.uid() = receiver_id OR
  (receiver_id IS NULL AND channel_id IS NULL) OR -- Global chat
  (channel_id IS NOT NULL AND (is_channel_public(channel_id) OR is_channel_member(channel_id)))
);

-- 25. STORAGE BUCKET FOR ATTACHMENTS
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat-attachments
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ( bucket_id = 'chat-attachments' );

DROP POLICY IF EXISTS "Anyone can view attachments" ON storage.objects;
CREATE POLICY "Anyone can view attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING ( bucket_id = 'chat-attachments' );

-- 20. BLOCKED USERS TABLE
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocks" ON public.blocked_users;
CREATE POLICY "Users can view their own blocks" ON public.blocked_users
  FOR SELECT TO authenticated
  USING ( auth.uid() = blocker_id );

DROP POLICY IF EXISTS "Users can block others" ON public.blocked_users;
CREATE POLICY "Users can block others" ON public.blocked_users
  FOR INSERT TO authenticated
  WITH CHECK ( auth.uid() = blocker_id );

DROP POLICY IF EXISTS "Users can unblock others" ON public.blocked_users;
CREATE POLICY "Users can unblock others" ON public.blocked_users
  FOR DELETE TO authenticated
  USING ( auth.uid() = blocker_id );
