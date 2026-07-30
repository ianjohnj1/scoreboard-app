-- Closes a live account-takeover hole in rpc_login(): if a profile had
-- pin_hash IS NULL AND is_guest = false, ANY PIN was accepted as a valid
-- login and immediately set as that account's permanent PIN. Combined with
-- the profiles SELECT policy being USING (true) - usernames are publicly
-- enumerable with just the anon key - this meant any of those accounts
-- could be silently claimed by a stranger who simply guessed a 4-digit PIN
-- for a known/enumerated username. 7 such profiles are live right now
-- (tracked in todo.md); this migration does not touch their rows - it only
-- removes the code path that let a stranger claim them. Decide what
-- happens to those 7 separately (a real claim flow, or marking them
-- guests) - this fix does not require or imply either.
--
-- Login now succeeds only when pin_hash actually matches. Faithful to the
-- rest of rpc_login (20260723_rls_lockdown_step2.sql): SECURITY DEFINER,
-- search_path pinned, extensions.digest() fully qualified, unchanged
-- session bootstrap/reuse logic below the credential check.

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
BEGIN
  v_pin_hash := encode(extensions.digest('scorekeeper:' || p_pin || ':salt2024', 'sha256'), 'hex');

  SELECT * INTO v_profile FROM profiles
  WHERE profiles.username = lower(trim(p_username)) AND profiles.pin_hash = v_pin_hash AND profiles.is_guest = false;

  IF NOT FOUND THEN
    RETURN; -- empty result set = invalid credentials
  END IF;

  UPDATE profiles SET updated_at = now() WHERE profiles.id = v_profile.id;

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
