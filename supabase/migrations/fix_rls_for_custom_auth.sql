-- Fix RLS for custom PIN-based auth
-- The previous hardening used auth.uid() which is always NULL for custom auth.

-- 1. match_players
DROP POLICY IF EXISTS "Only match host can modify players" ON match_players;
CREATE POLICY "Allow modification on match_players" ON match_players FOR ALL 
USING (true)
WITH CHECK (true);

-- 2. match_teams
DROP POLICY IF EXISTS "Only match host can modify teams" ON match_teams;
CREATE POLICY "Allow modification on match_teams" ON match_teams FOR ALL 
USING (true)
WITH CHECK (true);

-- 3. match_events
DROP POLICY IF EXISTS "Only match host can insert events" ON match_events;
CREATE POLICY "Allow insertion on match_events" ON match_events FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Only match host can update events" ON match_events;
CREATE POLICY "Allow update on match_events" ON match_events FOR UPDATE 
USING (true)
WITH CHECK (true);

-- 4. cricket_innings
DROP POLICY IF EXISTS "Only match host can modify innings" ON cricket_innings;
CREATE POLICY "Allow modification on cricket_innings" ON cricket_innings FOR ALL 
USING (true)
WITH CHECK (true);

-- 5. cricket_player_stats
DROP POLICY IF EXISTS "Only match host can modify player stats" ON cricket_player_stats;
CREATE POLICY "Allow modification on cricket_player_stats" ON cricket_player_stats FOR ALL 
USING (true)
WITH CHECK (true);

-- 6. golf_scores
DROP POLICY IF EXISTS "Only match host can modify golf scores" ON golf_scores;
CREATE POLICY "Allow modification on golf_scores" ON golf_scores FOR ALL 
USING (true)
WITH CHECK (true);

-- 7. match_rooms (for update/delete)
DROP POLICY IF EXISTS "Creators can update their matches" ON match_rooms;
CREATE POLICY "Allow update on match_rooms" ON match_rooms FOR UPDATE 
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Creators can delete their matches" ON match_rooms;
CREATE POLICY "Allow delete on match_rooms" ON match_rooms FOR DELETE 
USING (true);
