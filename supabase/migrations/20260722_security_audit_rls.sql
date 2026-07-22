-- Priority 1: RLS Remediation

-- 1. Helper function to get current profile_id from custom x-session-id header
CREATE OR REPLACE FUNCTION get_current_session_profile_id()
RETURNS uuid AS $$
DECLARE
  session_id text;
  prof_id uuid;
BEGIN
  -- Extract x-session-id from request headers
  session_id := current_setting('request.headers', true)::json->>'x-session-id';
  
  IF session_id IS NULL OR session_id = '' THEN
    RETURN NULL;
  END IF;

  -- Look up the profile_id for this active session
  SELECT profile_id INTO prof_id 
  FROM public.active_sessions 
  WHERE id = session_id::uuid;
  
  RETURN prof_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Helper function to check if current user is part of a match
CREATE OR REPLACE FUNCTION is_match_participant(target_match_id uuid)
RETURNS boolean AS $$
DECLARE
  current_prof_id uuid;
  is_host boolean;
  is_player boolean;
BEGIN
  current_prof_id := get_current_session_profile_id();
  IF current_prof_id IS NULL THEN RETURN false; END IF;

  -- Check if host
  SELECT EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = target_match_id AND created_by = current_prof_id
  ) INTO is_host;

  IF is_host THEN RETURN true; END IF;

  -- Check if player
  SELECT EXISTS (
    SELECT 1 FROM match_players 
    WHERE match_id = target_match_id AND profile_id = current_prof_id
  ) INTO is_player;

  RETURN is_player;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Fix active_sessions RLS
DROP POLICY IF EXISTS "Allow public update on active_sessions" ON active_sessions;
DROP POLICY IF EXISTS "Allow public delete on active_sessions" ON active_sessions;

CREATE POLICY "Users can update their own session" 
ON active_sessions FOR UPDATE 
USING (id::text = current_setting('request.headers', true)::json->>'x-session-id')
WITH CHECK (id::text = current_setting('request.headers', true)::json->>'x-session-id');

CREATE POLICY "Users can delete their own session" 
ON active_sessions FOR DELETE 
USING (id::text = current_setting('request.headers', true)::json->>'x-session-id');


-- 4. Fix match_rooms RLS
DROP POLICY IF EXISTS "Allow update on match_rooms" ON match_rooms;
DROP POLICY IF EXISTS "Allow delete on match_rooms" ON match_rooms;

CREATE POLICY "Hosts and participants can update match_rooms" 
ON match_rooms FOR UPDATE 
USING (is_match_participant(id))
WITH CHECK (is_match_participant(id));

CREATE POLICY "Only hosts can delete match_rooms" 
ON match_rooms FOR DELETE 
USING (created_by = get_current_session_profile_id());


-- 5. Fix match_players RLS
DROP POLICY IF EXISTS "Allow modification on match_players" ON match_players;
CREATE POLICY "Participants can modify match_players" 
ON match_players FOR ALL 
USING (is_match_participant(match_id))
WITH CHECK (is_match_participant(match_id));

-- (Also allow insert if you are creating the match)
CREATE POLICY "Creators can insert match_players" 
ON match_players FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id AND created_by = get_current_session_profile_id()
  )
);


-- 6. Fix match_teams RLS
DROP POLICY IF EXISTS "Allow modification on match_teams" ON match_teams;
CREATE POLICY "Participants can modify match_teams" 
ON match_teams FOR ALL 
USING (is_match_participant(match_id))
WITH CHECK (is_match_participant(match_id));

CREATE POLICY "Creators can insert match_teams" 
ON match_teams FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id AND created_by = get_current_session_profile_id()
  )
);


-- 7. Fix match_events RLS
DROP POLICY IF EXISTS "Allow insertion on match_events" ON match_events;
DROP POLICY IF EXISTS "Allow update on match_events" ON match_events;

CREATE POLICY "Participants can insert match_events" 
ON match_events FOR INSERT 
WITH CHECK (is_match_participant(match_id));

CREATE POLICY "Participants can update match_events" 
ON match_events FOR UPDATE 
USING (is_match_participant(match_id))
WITH CHECK (is_match_participant(match_id));


-- 8. Fix cricket_innings RLS
DROP POLICY IF EXISTS "Allow modification on cricket_innings" ON cricket_innings;
CREATE POLICY "Participants can modify cricket_innings" 
ON cricket_innings FOR ALL 
USING (is_match_participant(match_id))
WITH CHECK (is_match_participant(match_id));

CREATE POLICY "Creators can insert cricket_innings" 
ON cricket_innings FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id AND created_by = get_current_session_profile_id()
  )
);


-- 9. Fix cricket_player_stats RLS
DROP POLICY IF EXISTS "Allow modification on cricket_player_stats" ON cricket_player_stats;
CREATE POLICY "Participants can modify cricket_player_stats" 
ON cricket_player_stats FOR ALL 
USING (is_match_participant(match_id))
WITH CHECK (is_match_participant(match_id));


-- 10. Fix golf_scores RLS
DROP POLICY IF EXISTS "Allow modification on golf_scores" ON golf_scores;
CREATE POLICY "Participants can modify golf_scores" 
ON golf_scores FOR ALL 
USING (is_match_participant(match_id))
WITH CHECK (is_match_participant(match_id));

-- 11. Fix profiles RLS
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE 
USING (get_current_session_profile_id() = id) 
WITH CHECK (get_current_session_profile_id() = id);
