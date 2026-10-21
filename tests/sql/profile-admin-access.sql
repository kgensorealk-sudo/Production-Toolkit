\set ON_ERROR_STOP on
-- Run as a superuser against an empty, disposable PostgreSQL database.
-- All fixtures, grants, schema changes and test identities are rolled back.
BEGIN;
SET client_min_messages = warning;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE PUBLICATION supabase_realtime;

-- The existing schema's early migration expects usage_logs to exist already.
CREATE TABLE public.usage_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  tool_id text,
  duration_seconds integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  timestamp timestamptz DEFAULT now()
);
\ir ../../supabase_schema.sql

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'reader@example.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'operator@example.invalid'),
  ('00000000-0000-0000-0000-000000000003', 'other@example.invalid');
UPDATE public.profiles SET role = 'AdMiN'
WHERE id = '00000000-0000-0000-0000-000000000002';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

\echo Checking baseline schema
\ir profile-admin-assertions.sql

-- Simulate an existing installation with the vulnerable helper. The standalone
-- migration must replace it even when the baseline schema is not reapplied.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN EXISTS (
    SELECT FROM public.profiles WHERE id = auth.uid()
    AND (role = 'admin' OR lower(email) IN ('kgenso.realk@gmail.com', 'generalkevin53@gmail.com'))
  );
END $$;

\ir ../../security_fixes_migration.sql
\echo Checking upgraded installation
\ir profile-admin-assertions.sql

-- Reapplying the migration must remain safe.
\ir ../../security_fixes_migration.sql
\echo Checking repeated migration
\ir profile-admin-assertions.sql
ROLLBACK;
\echo PASS: schema, upgrade and repeated migration preserve admin boundaries
