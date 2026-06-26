ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access on match_events" ON match_events;
CREATE POLICY "Allow public access on match_events" ON match_events 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
