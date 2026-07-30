-- Rate-limits rpc_login(). PINs are 4 digits, hashed with a static salt and
-- a single SHA-256 round (10,000 candidates, sub-second to compute), and
-- until now nothing throttled attempts - with the account-takeover
-- fallback closed in 20260730204939/20260730211610, a direct PIN brute
-- force against a known username was the remaining way into an account
-- that isn't yours.
--
-- Scoped to per-username counting, not per-IP: this app has no reliable
-- caller IP inside a SECURITY DEFINER function (Supabase's proxy headers
-- aren't guaranteed present/trustworthy), and username-keyed limiting
-- already closes the actual threat this item was filed for - brute-forcing
-- one victim's PIN. It does not stop a low-and-slow scan trying a handful
-- of guesses across many different usernames (each individually under the
-- threshold); closing that needs the broader "usernames are publicly
-- enumerable" P2 item (USING (true) on profiles SELECT) addressed first,
-- which is a bigger, deliberately-deferred call about this app's audience.
--
-- login_attempts has RLS enabled with zero policies, so only a
-- SECURITY DEFINER function can touch it - anon/authenticated get nothing.
-- 10 failed attempts per rolling 15-minute window per username: exhausting
-- the 10,000-candidate keyspace at that rate takes over 10 days. The gate
-- is checked before any credential comparison, and the response is the
-- same empty result set as a wrong PIN either way, so a caller can't tell
-- "wrong" from "locked out" - and while locked out, even the correct PIN
-- is rejected, which is the point. Rows are pruned inline (no pg_cron
-- dependency): stale attempts for a username are deleted on its own next
-- login call, and a successful login clears that username's history.
--
-- Known imprecision, accepted rather than engineered around: concurrent
-- requests can race past the exact threshold by a handful before it bites,
-- since there's no advisory lock around the count-then-insert. Immaterial
-- against a 10,000-value keyspace and not worth the complexity for this
-- app's threat model.
--
-- BUG, fixed by 20260730213012 seconds later: the `username` references
-- below are unqualified, but rpc_login's RETURNS TABLE also declares an
-- output column named `username`, so every reference here is actually
-- ambiguous. This version broke every login, not just the rate-limit
-- path - kept as-is (not edited in place) so this file matches what was
-- truly live under this version, per this repo's own migration-drift
-- lesson (see CLAUDE.md). Do not copy this file's WHERE clauses.

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time
  ON public.login_attempts (username, attempted_at);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: nobody gets direct access, only rpc_login() via SECURITY DEFINER.

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
   WHERE username = v_username AND attempted_at < now() - interval '15 minutes';

  SELECT count(*) INTO v_recent_failures FROM login_attempts WHERE username = v_username;

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

  DELETE FROM login_attempts WHERE username = v_username;

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
