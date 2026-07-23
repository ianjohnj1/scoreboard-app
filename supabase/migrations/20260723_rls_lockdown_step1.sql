-- RLS Lockdown Step 1: drop legacy fully-permissive policies discovered via a live
-- pg_policies audit (they predate the various "hardening"/"security_audit" migrations
-- and were never dropped; Postgres OR's multiple permissive policies together, so a
-- single forgotten USING(true)/WITH CHECK(true) silently defeated every later fix).
-- This step intentionally does NOT touch active_sessions or profiles.pin_hash exposure
-- - those require a coordinated client+DB change (see 20260723_rls_lockdown_step2.sql).

-- ============================================================================
-- 0. New helper functions
-- ============================================================================

CREATE OR REPLACE FUNCTION is_match_host(target_match_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM match_rooms
    WHERE id = target_match_id AND created_by = get_current_session_profile_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Anyone allowed to enter/edit scores for a match: the host, or a match_players
-- row with an active scoring role (excludes pure spectators).
CREATE OR REPLACE FUNCTION can_score_match(target_match_id uuid)
RETURNS boolean AS $$
  SELECT is_match_host(target_match_id) OR EXISTS (
    SELECT 1 FROM match_players
    WHERE match_id = target_match_id
      AND profile_id = get_current_session_profile_id()
      AND role IN ('player', 'scorer')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Pin search_path on the pre-existing SECURITY DEFINER functions too.
ALTER FUNCTION get_current_session_profile_id() SET search_path = public, pg_temp;
ALTER FUNCTION is_match_participant(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION is_admin_session() SET search_path = public, pg_temp;

-- ============================================================================
-- 1. profiles
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Allow guest profile creation" ON profiles;
DROP POLICY IF EXISTS "Allow public insert on profiles" ON profiles;
DROP POLICY IF EXISTS "Allow public registration" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Public Read Access" ON profiles;
DROP POLICY IF EXISTS "Allow public read on profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;
DROP POLICY IF EXISTS "Anon can read profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Allow public update on profiles" ON profiles;

CREATE POLICY "Public profiles are readable by everyone"
ON profiles FOR SELECT USING (true); -- intentional: leaderboards/spectator views need public profile reads

CREATE POLICY "Self-service profile creation without admin escalation"
ON profiles FOR INSERT WITH CHECK (is_admin = false);

-- "Users can update own profile or admins can update guests" (row-ownership only)
-- is left in place; the trigger below is what actually restricts *which* columns
-- a non-admin owner may change.
CREATE OR REPLACE FUNCTION guard_profiles_protected_columns()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND NOT is_admin_session() THEN
      RAISE EXCEPTION 'Only an admin session may change is_admin';
    END IF;
    IF NEW.is_guest IS DISTINCT FROM OLD.is_guest AND NOT is_admin_session() THEN
      RAISE EXCEPTION 'Only an admin session may change is_guest';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS TRUE AND NOT is_admin_session() THEN
      RAISE EXCEPTION 'Cannot self-assign admin at signup';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_profiles_protected_columns ON profiles;
CREATE TRIGGER trg_guard_profiles_protected_columns
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION guard_profiles_protected_columns();

-- ============================================================================
-- 2. match_rooms
-- ============================================================================

DROP POLICY IF EXISTS "Allow public insert on match_rooms" ON match_rooms;
DROP POLICY IF EXISTS "Allow public registration" ON match_rooms;
DROP POLICY IF EXISTS "Anyone can create a match" ON match_rooms;
DROP POLICY IF EXISTS "Authenticated users can create match rooms" ON match_rooms;
DROP POLICY IF EXISTS "Anon can read match rooms" ON match_rooms;
DROP POLICY IF EXISTS "Public Read Access" ON match_rooms;
DROP POLICY IF EXISTS "Public matches are viewable by everyone" ON match_rooms;
DROP POLICY IF EXISTS "Allow public read on match_rooms" ON match_rooms;
DROP POLICY IF EXISTS "Anyone can read match rooms" ON match_rooms;
DROP POLICY IF EXISTS "Participants can update active match rooms" ON match_rooms;
DROP POLICY IF EXISTS "Allow public update on match_rooms" ON match_rooms;
DROP POLICY IF EXISTS "Allow public delete on match_rooms" ON match_rooms;

CREATE POLICY "Public match rooms are readable by everyone"
ON match_rooms FOR SELECT USING (true); -- intentional: spectator/leaderboard views

CREATE POLICY "Caller can only create a match under their own identity"
ON match_rooms FOR INSERT
WITH CHECK (created_by = get_current_session_profile_id() OR created_by IS NULL);

-- "Hosts and participants can update match_rooms" (is_match_participant) and
-- "Hosts and admins can delete match_rooms" already exist and are correctly scoped;
-- they were just being drowned out by the anon/authenticated `true` policies above.

CREATE OR REPLACE FUNCTION guard_match_rooms_protected_columns()
RETURNS trigger AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT is_admin_session() THEN
    RAISE EXCEPTION 'created_by cannot be reassigned';
  END IF;

  IF OLD.status = 'completed' AND (
       NEW.status IS DISTINCT FROM OLD.status OR
       NEW.winner_profile_id IS DISTINCT FROM OLD.winner_profile_id OR
       NEW.winner_team_id IS DISTINCT FROM OLD.winner_team_id
     )
     AND NOT (is_match_host(OLD.id) OR is_admin_session())
  THEN
    RAISE EXCEPTION 'Only the host or an admin can change a completed match''s result';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_match_rooms ON match_rooms;
CREATE TRIGGER trg_guard_match_rooms
BEFORE UPDATE ON match_rooms
FOR EACH ROW EXECUTE FUNCTION guard_match_rooms_protected_columns();

-- ============================================================================
-- 3. match_events
-- ============================================================================

DROP POLICY IF EXISTS "Allow public delete on match_events" ON match_events;
DROP POLICY IF EXISTS "Authenticated users can insert match events" ON match_events;
DROP POLICY IF EXISTS "Allow public access on match_events" ON match_events;
DROP POLICY IF EXISTS "Anyone can read match events" ON match_events;
DROP POLICY IF EXISTS "Anon can read match events" ON match_events;
DROP POLICY IF EXISTS "Authenticated users can update match events" ON match_events;
DROP POLICY IF EXISTS "Participants can insert match_events" ON match_events;
DROP POLICY IF EXISTS "Participants can update match_events" ON match_events;

CREATE POLICY "Public match events are readable by everyone"
ON match_events FOR SELECT USING (true); -- intentional: spectator views

CREATE POLICY "Scorers can insert match_events"
ON match_events FOR INSERT WITH CHECK (can_score_match(match_id));

CREATE POLICY "Scorers can update match_events"
ON match_events FOR UPDATE
USING (can_score_match(match_id)) WITH CHECK (can_score_match(match_id));

CREATE OR REPLACE FUNCTION guard_match_events()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.recorded_by := get_current_session_profile_id(); -- never trust client input
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_undone IS DISTINCT FROM OLD.is_undone
       AND NOT (OLD.recorded_by = get_current_session_profile_id() OR is_match_host(OLD.match_id))
    THEN
      RAISE EXCEPTION 'Only the recorder or the match host can undo/redo this event';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_match_events ON match_events;
CREATE TRIGGER trg_guard_match_events
BEFORE INSERT OR UPDATE ON match_events
FOR EACH ROW EXECUTE FUNCTION guard_match_events();

-- ============================================================================
-- 4. match_players / match_teams
-- ============================================================================

DROP POLICY IF EXISTS "Allow public delete on match_players" ON match_players;
DROP POLICY IF EXISTS "Authenticated users can create match players" ON match_players;
DROP POLICY IF EXISTS "Anon can read match players" ON match_players;
DROP POLICY IF EXISTS "Anyone can read match players" ON match_players;
DROP POLICY IF EXISTS "Allow public access on match_players" ON match_players;
DROP POLICY IF EXISTS "Authenticated users can update match players" ON match_players;
DROP POLICY IF EXISTS "Participants can modify match_players" ON match_players;

CREATE POLICY "Public match players are readable by everyone"
ON match_players FOR SELECT USING (true);

-- "Creators can insert match_players" (host-only) already exists and is kept as-is.

CREATE POLICY "Self or host can update match_players"
ON match_players FOR UPDATE
USING (profile_id = get_current_session_profile_id() OR is_match_host(match_id))
WITH CHECK (profile_id = get_current_session_profile_id() OR is_match_host(match_id));

CREATE POLICY "Self or host can delete match_players"
ON match_players FOR DELETE
USING (profile_id = get_current_session_profile_id() OR is_match_host(match_id));

DROP POLICY IF EXISTS "Allow public delete on match_teams" ON match_teams;
DROP POLICY IF EXISTS "Authenticated users can create match teams" ON match_teams;
DROP POLICY IF EXISTS "Allow public access on match_teams" ON match_teams;
DROP POLICY IF EXISTS "Anon can read match teams" ON match_teams;
DROP POLICY IF EXISTS "Anyone can read match teams" ON match_teams;
DROP POLICY IF EXISTS "Authenticated users can update match teams" ON match_teams;
DROP POLICY IF EXISTS "Participants can modify match_teams" ON match_teams;

CREATE POLICY "Public match teams are readable by everyone"
ON match_teams FOR SELECT USING (true);

-- "Creators can insert match_teams" (host-only) already exists and is kept as-is.

CREATE POLICY "Host can update match_teams"
ON match_teams FOR UPDATE USING (is_match_host(match_id)) WITH CHECK (is_match_host(match_id));

CREATE POLICY "Host can delete match_teams"
ON match_teams FOR DELETE USING (is_match_host(match_id));

-- ============================================================================
-- 5. cricket_innings / cricket_player_stats / golf_scores / golf_holes
-- ============================================================================

DROP POLICY IF EXISTS "Allow public delete on cricket_innings" ON cricket_innings;
DROP POLICY IF EXISTS "Authenticated users can manage cricket innings" ON cricket_innings;
DROP POLICY IF EXISTS "Anyone can read cricket innings" ON cricket_innings;
DROP POLICY IF EXISTS "Anon can read cricket innings" ON cricket_innings;
DROP POLICY IF EXISTS "Allow public access on cricket_innings" ON cricket_innings;
DROP POLICY IF EXISTS "Authenticated users can update cricket innings" ON cricket_innings;
DROP POLICY IF EXISTS "Participants can modify cricket_innings" ON cricket_innings;

CREATE POLICY "Public cricket_innings are readable by everyone"
ON cricket_innings FOR SELECT USING (true);

CREATE POLICY "Scorers can modify cricket_innings"
ON cricket_innings FOR ALL USING (can_score_match(match_id)) WITH CHECK (can_score_match(match_id));
-- "Creators can insert cricket_innings" (host-only) already exists and is kept as-is.

DROP POLICY IF EXISTS "Allow public delete on cricket_player_stats" ON cricket_player_stats;
DROP POLICY IF EXISTS "Authenticated users can manage cricket stats" ON cricket_player_stats;
DROP POLICY IF EXISTS "Anyone can read cricket stats" ON cricket_player_stats;
DROP POLICY IF EXISTS "Allow public access on cricket_player_stats" ON cricket_player_stats;
DROP POLICY IF EXISTS "Anon can read cricket stats" ON cricket_player_stats;
DROP POLICY IF EXISTS "Authenticated users can update cricket stats" ON cricket_player_stats;
DROP POLICY IF EXISTS "Participants can modify cricket_player_stats" ON cricket_player_stats;

CREATE POLICY "Public cricket_player_stats are readable by everyone"
ON cricket_player_stats FOR SELECT USING (true);

CREATE POLICY "Scorers can modify cricket_player_stats"
ON cricket_player_stats FOR ALL USING (can_score_match(match_id)) WITH CHECK (can_score_match(match_id));

DROP POLICY IF EXISTS "Allow public access on golf_scores" ON golf_scores;
DROP POLICY IF EXISTS "Authenticated users can manage golf scores" ON golf_scores;
DROP POLICY IF EXISTS "Public access on golf_scores" ON golf_scores;
DROP POLICY IF EXISTS "Anyone can read golf scores" ON golf_scores;
DROP POLICY IF EXISTS "Anon can read golf scores" ON golf_scores;
DROP POLICY IF EXISTS "Authenticated users can update golf scores" ON golf_scores;
DROP POLICY IF EXISTS "Participants can modify golf_scores" ON golf_scores;

CREATE POLICY "Public golf_scores are readable by everyone"
ON golf_scores FOR SELECT USING (true);

CREATE POLICY "Scorers can modify golf_scores"
ON golf_scores FOR ALL USING (can_score_match(match_id)) WITH CHECK (can_score_match(match_id));

DROP POLICY IF EXISTS "Allow public access on golf_holes" ON golf_holes;
DROP POLICY IF EXISTS "Authenticated users can manage golf holes" ON golf_holes;
DROP POLICY IF EXISTS "Anyone can read golf holes" ON golf_holes;
DROP POLICY IF EXISTS "Anon can read golf holes" ON golf_holes;
DROP POLICY IF EXISTS "Authenticated users can update golf holes" ON golf_holes;

CREATE POLICY "Public golf_holes are readable by everyone"
ON golf_holes FOR SELECT USING (true);

CREATE POLICY "Host can insert golf_holes"
ON golf_holes FOR INSERT WITH CHECK (is_match_host(match_id));

CREATE POLICY "Scorers can update golf_holes"
ON golf_holes FOR UPDATE USING (can_score_match(match_id)) WITH CHECK (can_score_match(match_id));

CREATE POLICY "Host can delete golf_holes"
ON golf_holes FOR DELETE USING (is_match_host(match_id));

-- ============================================================================
-- 6. player_career_stats
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can manage career stats" ON player_career_stats;
DROP POLICY IF EXISTS "Anyone can read career stats" ON player_career_stats;
DROP POLICY IF EXISTS "Anon can read career stats" ON player_career_stats;
DROP POLICY IF EXISTS "Authenticated users can update career stats" ON player_career_stats;

CREATE POLICY "Public career stats are readable by everyone"
ON player_career_stats FOR SELECT USING (true); -- intentional: leaderboards are public

CREATE POLICY "Players can only insert their own career stats"
ON player_career_stats FOR INSERT WITH CHECK (profile_id = get_current_session_profile_id());

CREATE POLICY "Players can only update their own career stats"
ON player_career_stats FOR UPDATE
USING (profile_id = get_current_session_profile_id())
WITH CHECK (profile_id = get_current_session_profile_id());

SELECT pg_notify('pgrst', 'reload schema');
