-- Included by profile-admin-access.sql; all assertions execute under RLS.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  candidate_email text;
  changed integer;
BEGIN
  UPDATE public.profiles SET display_name = 'Updated reader' WHERE id = auth.uid();
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Normal profile edits must succeed'; END IF;

  FOREACH candidate_email IN ARRAY ARRAY['kgenso.realk@gmail.com', 'generalkevin53@gmail.com'] LOOP
    UPDATE public.profiles SET email = candidate_email WHERE id = auth.uid();
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN RAISE EXCEPTION 'Email edit did not exercise escalation attempt'; END IF;
    IF public.is_admin() THEN RAISE EXCEPTION 'Profile email granted admin access'; END IF;
    IF (SELECT count(*) FROM public.profiles) <> 1 THEN
      RAISE EXCEPTION 'User gained access to other profiles';
    END IF;

    BEGIN
      UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
      RAISE EXCEPTION 'Self-promotion was allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      UPDATE public.profiles SET is_subscribed = true WHERE id = auth.uid();
      RAISE EXCEPTION 'Self-subscription was allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      INSERT INTO public.access_keys (key, tool) VALUES ('UNAUTHORIZED', 'universal');
      RAISE EXCEPTION 'Unauthorized access key creation was allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    UPDATE public.profiles SET display_name = 'Unauthorized edit'
    WHERE id = '00000000-0000-0000-0000-000000000003';
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'User changed another profile'; END IF;
  END LOOP;
  UPDATE public.profiles SET email = 'reader@example.invalid' WHERE id = auth.uid();
END $$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
DO $$
DECLARE changed integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Protected admin role must retain access'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 3 THEN
    RAISE EXCEPTION 'Admin cannot read all profiles';
  END IF;
  UPDATE public.profiles SET is_subscribed = true, role = 'admin'
  WHERE id = '00000000-0000-0000-0000-000000000003';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Admin cannot manage another profile'; END IF;
  UPDATE public.profiles SET is_subscribed = false, role = 'user'
  WHERE id = '00000000-0000-0000-0000-000000000003';
  INSERT INTO public.access_keys (key, tool) VALUES ('AUTHORIZED', 'universal');
  DELETE FROM public.access_keys WHERE key = 'AUTHORIZED';
END $$;

SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
DO $$ BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'Missing profile must not grant admin access'; END IF;
END $$;
SET LOCAL request.jwt.claim.sub = '';
DO $$ BEGIN
  IF public.is_admin() THEN RAISE EXCEPTION 'Missing identity must not grant admin access'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 0 THEN
    RAISE EXCEPTION 'Missing identity can read profiles';
  END IF;
END $$;
RESET ROLE;
