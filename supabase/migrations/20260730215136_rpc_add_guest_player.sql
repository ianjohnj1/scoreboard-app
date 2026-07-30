-- Closes "anyone can create unlimited profiles": the profiles INSERT
-- policy was only `is_admin = false`, with no session requirement and no
-- rate limit, and both client-side guest-add call sites
-- (MatchRoomPage.tsx, NewMatchPage.tsx) inserted directly. Nothing needed
-- to be logged in at all - a single unauthenticated script could fill the
-- free plan's 500 MB database.
--
-- guest_creation_log has RLS enabled with zero policies, same pattern as
-- login_attempts: only rpc_add_guest_player()'s SECURITY DEFINER can touch
-- it. 30 guest creations per rolling hour per *creating* session (not per
-- match) - generous for a host setting up several matches back to back,
-- far below anything that could meaningfully fill the database. Stale rows
-- pruned inline on that creator's own next call, no pg_cron dependency.
--
-- rpc_add_guest_player() requires an active session
-- (get_current_session_profile_id() IS NOT NULL) - unlike the rate-limit
-- check in rpc_login, there's no adversarial timing-oracle concern here
-- (the caller is already identified), so both the "not logged in" and
-- "rate limited" cases raise a real exception rather than degrading
-- silently.
--
-- The profiles INSERT policy is dropped outright, not just tightened:
-- guest creation was the only client-side INSERT path into profiles
-- (rpc_signup is SECURITY DEFINER and never depended on this policy), so
-- after routing it through this RPC nothing should ever INSERT into
-- profiles directly again. With no INSERT policy left, RLS default-denies
-- any remaining attempt.

CREATE TABLE IF NOT EXISTS public.guest_creation_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creator_profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_creation_log_creator_time
  ON public.guest_creation_log (creator_profile_id, created_at);

ALTER TABLE public.guest_creation_log ENABLE ROW LEVEL SECURITY;
-- No policies: nobody gets direct access, only rpc_add_guest_player() via SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.rpc_add_guest_player(p_display_name text)
RETURNS TABLE(id uuid, username text, display_name text, is_guest boolean, is_admin boolean, avatar_color text, avatar_url text, catchphrase text, linked_profile_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_creator_id uuid;
  v_recent_count int;
  v_username text;
  v_profile profiles%ROWTYPE;
BEGIN
  v_creator_id := get_current_session_profile_id();
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Must be logged in to add a guest player';
  END IF;

  DELETE FROM guest_creation_log
   WHERE guest_creation_log.creator_profile_id = v_creator_id
     AND guest_creation_log.created_at < now() - interval '1 hour';

  SELECT count(*) INTO v_recent_count
    FROM guest_creation_log
   WHERE guest_creation_log.creator_profile_id = v_creator_id;

  IF v_recent_count >= 30 THEN
    RAISE EXCEPTION 'Too many guest players created recently - please wait a while and try again';
  END IF;

  IF trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'Guest name cannot be empty';
  END IF;

  v_username := 'guest_' || substr(gen_random_uuid()::text, 1, 8);

  INSERT INTO profiles (username, display_name, avatar_color, is_guest, is_admin)
  VALUES (v_username, trim(p_display_name), '#f59e0b', true, false)
  RETURNING * INTO v_profile;

  INSERT INTO guest_creation_log (creator_profile_id) VALUES (v_creator_id);

  RETURN QUERY SELECT
    v_profile.id, v_profile.username, v_profile.display_name, v_profile.is_guest,
    v_profile.is_admin, v_profile.avatar_color, v_profile.avatar_url, v_profile.catchphrase,
    v_profile.linked_profile_id, v_profile.created_at, v_profile.updated_at;
END;
$function$;

DROP POLICY IF EXISTS "Self-service profile creation without admin escalation" ON public.profiles;
