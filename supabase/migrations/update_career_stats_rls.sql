ALTER TABLE player_career_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access on player_career_stats" ON player_career_stats;
CREATE POLICY "Allow public access on player_career_stats" ON player_career_stats 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
