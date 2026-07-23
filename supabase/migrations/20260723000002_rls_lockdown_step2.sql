-- RLS Lockdown Step 2: move PIN verification + session minting into SECURITY DEFINER
-- RPC functions, then lock down active_sessions so a client can no longer forge a
-- session for an arbitrary profile_id (the only real fix for that hole - RLS alone
-- can't express "the caller already proved who they are in an earlier request").

-- ============================================================================
-- rpc_login: verifies PIN (or performs the one-time self-service reset when
-- pin_hash IS NULL, preserving 20260723_reset_pin_hash.sql's intent), then
-- atomically creates/reuses the session. Never returns pin_hash.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_login(p_username text, p_pin text)
RETURNS TABLE (
  id uuid, username text, display_name text, is_guest boolean, is_admin boolean,
  avatar_color text, avatar_url text, catchphrase text, linked_profile_id uuid,
  created_at timestamptz, updated_at timestamptz, session_id uuid
) AS $$
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
    WHERE profiles.username = lower(trim(p_username)) AND profiles.pin_hash IS NULL AND profiles.is_guest = false;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION rpc_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_login(text, text) TO anon, authenticated;

-- ============================================================================
-- rpc_signup: creates a brand-new non-guest profile + session atomically.
-- is_admin is hardcoded false - never taken from client input.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_signup(p_display_name text, p_pin text, p_username text)
RETURNS TABLE (
  id uuid, username text, display_name text, is_guest boolean, is_admin boolean,
  avatar_color text, avatar_url text, catchphrase text, linked_profile_id uuid,
  created_at timestamptz, updated_at timestamptz, session_id uuid
) AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_session_id uuid;
  v_colors text[] := ARRAY['#3b82f6','#10b981','#f97316','#ef4444','#8b5cf6','#06b6d4','#f59e0b','#ec4899','#14b8a6','#84cc16'];
  v_username text := lower(trim(p_username));
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE profiles.username = v_username) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  INSERT INTO profiles (display_name, username, pin_hash, is_guest, is_admin, avatar_color)
  VALUES (
    trim(p_display_name), v_username,
    encode(extensions.digest('scorekeeper:' || p_pin || ':salt2024', 'sha256'), 'hex'),
    false, false,
    v_colors[1 + floor(random() * array_length(v_colors, 1))]
  )
  RETURNING * INTO v_profile;

  INSERT INTO active_sessions (profile_id, last_seen) VALUES (v_profile.id, now())
  RETURNING active_sessions.id INTO v_session_id;

  RETURN QUERY SELECT
    v_profile.id, v_profile.username, v_profile.display_name, v_profile.is_guest,
    v_profile.is_admin, v_profile.avatar_color, v_profile.avatar_url, v_profile.catchphrase,
    v_profile.linked_profile_id, v_profile.created_at, v_profile.updated_at, v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION rpc_signup(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_signup(text, text, text) TO anon, authenticated;

-- ============================================================================
-- rpc_resume_session: resolves strictly from the x-session-id request header
-- (via the existing get_current_session_profile_id()) - takes NO profile_id
-- argument, so it can never be used to "recover" a session for someone else.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_resume_session()
RETURNS TABLE (
  id uuid, username text, display_name text, is_guest boolean, is_admin boolean,
  avatar_color text, avatar_url text, catchphrase text, linked_profile_id uuid,
  created_at timestamptz, updated_at timestamptz
) AS $$
DECLARE
  v_prof_id uuid;
  v_session_id text;
BEGIN
  v_prof_id := get_current_session_profile_id();
  IF v_prof_id IS NULL THEN
    RETURN;
  END IF;

  v_session_id := current_setting('request.headers', true)::json->>'x-session-id';
  UPDATE active_sessions SET last_seen = now() WHERE active_sessions.id = v_session_id::uuid;

  RETURN QUERY SELECT
    profiles.id, profiles.username, profiles.display_name, profiles.is_guest, profiles.is_admin,
    profiles.avatar_color, profiles.avatar_url, profiles.catchphrase, profiles.linked_profile_id,
    profiles.created_at, profiles.updated_at
  FROM profiles WHERE profiles.id = v_prof_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION rpc_resume_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_resume_session() TO anon, authenticated;

-- ============================================================================
-- Lock down active_sessions now that the RPCs are the sole legitimate path
-- to create a session. Keep only the already-correct header-scoped
-- UPDATE (heartbeat) / DELETE (logout) policies.
-- ============================================================================

DROP POLICY IF EXISTS "Allow public select on active_sessions" ON active_sessions;
DROP POLICY IF EXISTS "Anon can read active sessions" ON active_sessions;
DROP POLICY IF EXISTS "Anyone can read active sessions" ON active_sessions;
DROP POLICY IF EXISTS "Allow public insert on active_sessions" ON active_sessions;
DROP POLICY IF EXISTS "Authenticated users can manage active sessions" ON active_sessions;
DROP POLICY IF EXISTS "Authenticated users can update active sessions" ON active_sessions;
DROP POLICY IF EXISTS "Authenticated users can delete active sessions" ON active_sessions;
-- "Users can update their own session" / "Users can delete their own session" are kept as-is.

SELECT pg_notify('pgrst', 'reload schema');
