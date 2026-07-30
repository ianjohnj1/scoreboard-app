-- Every sport room's canInteract check treats ctx.isAdmin as a blanket
-- override (match.status === 'active' || ctx.isAdmin), same as the
-- match_rooms fix in 20260730024459. But can_score_match() - the gate
-- behind match_events, cricket_innings, cricket_player_stats, golf_holes
-- (UPDATE), and golf_scores - never got that override, so an admin
-- scoring a match they didn't create or join gets a hard RLS-violation
-- error on every scoring write (recordEvent() throws). Add it once here
-- since every one of those policies calls through this single function.
CREATE OR REPLACE FUNCTION public.can_score_match(target_match_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT is_match_host(target_match_id) OR is_admin_session() OR EXISTS (
    SELECT 1 FROM match_players
    WHERE match_id = target_match_id
      AND profile_id = get_current_session_profile_id()
      AND role IN ('player', 'scorer')
  );
$function$;

-- Same gap on match_players: MatchRoomPage's "Add Player" (Edit Roster,
-- reachable by any admin via the header menu on any match) INSERTs into
-- match_players, but the INSERT policy only allowed the match's creator.
DROP POLICY IF EXISTS "Creators can insert match_players" ON match_players;

CREATE POLICY "Creators and admins can insert match_players"
ON match_players FOR INSERT
WITH CHECK (
  is_admin_session()
  OR EXISTS (
    SELECT 1 FROM match_rooms
    WHERE match_rooms.id = match_players.match_id
      AND match_rooms.created_by = get_current_session_profile_id()
  )
);

-- No client code updates match_players/match_teams today, but every other
-- write path in this app now assumes an app-wide admin override exists -
-- close the same gap here for consistency before something starts relying
-- on it and hits the same silent-failure class of bug.
DROP POLICY IF EXISTS "Self or host can update match_players" ON match_players;

CREATE POLICY "Self, host, or admin can update match_players"
ON match_players FOR UPDATE
USING (profile_id = get_current_session_profile_id() OR is_match_host(match_id) OR is_admin_session())
WITH CHECK (profile_id = get_current_session_profile_id() OR is_match_host(match_id) OR is_admin_session());

DROP POLICY IF EXISTS "Creators can insert match_teams" ON match_teams;

CREATE POLICY "Creators and admins can insert match_teams"
ON match_teams FOR INSERT
WITH CHECK (
  is_admin_session()
  OR EXISTS (
    SELECT 1 FROM match_rooms
    WHERE match_rooms.id = match_teams.match_id
      AND match_rooms.created_by = get_current_session_profile_id()
  )
);

DROP POLICY IF EXISTS "Host can update match_teams" ON match_teams;

CREATE POLICY "Host or admin can update match_teams"
ON match_teams FOR UPDATE
USING (is_match_host(match_id) OR is_admin_session())
WITH CHECK (is_match_host(match_id) OR is_admin_session());
