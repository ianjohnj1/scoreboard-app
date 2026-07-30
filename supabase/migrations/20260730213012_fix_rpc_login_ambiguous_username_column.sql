-- Fixes the bug in 20260730212541: rpc_login's RETURNS TABLE declares an
-- output column named `username`, so the bare `username` references that
-- migration added (in the new rate-limiting DELETE/SELECT/INSERT against
-- login_attempts) were ambiguous between that output column and the
-- login_attempts.username table column. Postgres rejected every call with
-- `column reference "username" is ambiguous`, which broke login entirely -
-- not just the rate-limit path - for the roughly one minute this was live
-- before this fix-forward was applied. Caught immediately by testing
-- rpc_login('claudetester', '1234') right after deploying 20260730212541.
--
-- Fix: qualify every login_attempts.username reference explicitly. No
-- behavioural change beyond making the function actually work again.

CREATE OR REPLACE FUNCTION public.rpc_login(p_username text, p_pin text)
RETURNS TABLE(id uuid, username text, display_name text, is_guest boolean, is_admin boolean, avatar_color text, avatar_url text, catchphrase text, linked_profile_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, session_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile profiles%ROWTYPE;
  v_pin_hash text;
  v_session_id uuid;
  v_username text := lower(trim(p_username));
  v_recent_failures int;
BEGIN
  DELETE FROM login_attempts
   WHERE login_attempts.username = v_username
     AND login_attempts.attempted_at < now() - interval '15 minutes';

  SELECT count(*) INTO v_recent_failures FROM login_attempts WHERE login_attempts.username = v_username;

  IF v_recent_failures >= 10 THEN
    RETURN; -- rate limited: identical empty response to a wrong PIN
  END IF;

  v_pin_hash := encode(extensions.digest('scorekeeper:' || p_pin || ':salt2024', 'sha256'), 'hex');

  SELECT * INTO v_profile FROM profiles
  WHERE profiles.username = v_username AND profiles.pin_hash = v_pin_hash AND profiles.is_guest = false;

  IF NOT FOUND THEN
    SELECT * INTO v_profile FROM profiles
    WHERE profiles.username = v_username
      AND profiles.pin_hash IS NULL
      AND profiles.is_guest = false
      AND profiles.username = ANY (ARRAY[
        'mrchanman', 'primeserpentz', 'dnagle9801@gmail.com',
        'bandy1703@hotmail.com', 'worko06', 'chole', 'andrewjones98'
      ]);

    IF NOT FOUND THEN
      INSERT INTO login_attempts (username) VALUES (v_username);
      RETURN; -- empty result set = invalid credentials
    END IF;

    UPDATE profiles SET pin_hash = v_pin_hash, updated_at = now()
    WHERE profiles.id = v_profile.id RETURNING * INTO v_profile;
  ELSE
    UPDATE profiles SET updated_at = now() WHERE profiles.id = v_profile.id;
  END IF;

  DELETE FROM login_attempts WHERE login_attempts.username = v_username;

  SELECT active_sessions.id INTO v_session_id FROM active_sessions
  WHERE active_sessions.profile_id = v_profile.id LIMIT 1;

  IF v_session_id IS NULL THEN
    INSERT INTO active_sessions (profile_id, last_seen)
    VALUES (v_profile.id, now()) RETURNING active_sessions.id INTO v_session_id;
  ELSE
    UPDATE active_sessions SET last_seen = now() WHERE active_sessions.id = v_session_id;
  END IF;

  RETURN QUERY SELECT
    v_profile.id, v_profile.username, v_profile.display_name, v_profile.is_guest,
    v_profile.is_admin, v_profile.avatar_color, v_profile.avatar_url, v_profile.catchphrase,
    v_profile.linked_profile_id, v_profile.created_at, v_profile.updated_at, v_session_id;
END;
$function$;
