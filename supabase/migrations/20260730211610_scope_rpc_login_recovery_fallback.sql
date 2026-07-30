-- Restores self-service recovery for the 7 known stragglers from
-- 20260723000004_reset_pin_hash.sql (a PIN-hashing-scheme unification that
-- wiped every profile's pin_hash and expected a one-time self-service
-- re-set on next login), without reopening the account-takeover hole
-- closed in 20260730204939_fix_rpc_login_account_takeover.sql.
--
-- The difference from the removed fallback: this one only ever matches a
-- fixed, closed list of usernames, not "any row with pin_hash IS NULL".
-- These are real accounts these specific people already set up and used
-- before the reset, not unclaimed placeholders - profiles.username has a
-- DB-level UNIQUE constraint, so there's no way for another row to shadow
-- one of these usernames. Do not add usernames to this list going
-- forward for new/placeholder accounts - rpc_signup always sets a real
-- pin_hash immediately, so no legitimately-created account should ever
-- need this path. If the list needs to grow, it should be because another
-- genuine pre-reset straggler turns up, not as a general-purpose escape
-- hatch.

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
    SELECT * INTO v_profile FROM profiles
    WHERE profiles.username = lower(trim(p_username))
      AND profiles.pin_hash IS NULL
      AND profiles.is_guest = false
      AND profiles.username = ANY (ARRAY[
        'mrchanman', 'primeserpentz', 'dnagle9801@gmail.com',
        'bandy1703@hotmail.com', 'worko06', 'chole', 'andrewjones98'
      ]);

    IF NOT FOUND THEN
      RETURN; -- empty result set = invalid credentials
    END IF;

    UPDATE profiles SET pin_hash = v_pin_hash, updated_at = now()
    WHERE profiles.id = v_profile.id RETURNING * INTO v_profile;
  ELSE
    UPDATE profiles SET updated_at = now() WHERE profiles.id = v_profile.id;
  END IF;

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
