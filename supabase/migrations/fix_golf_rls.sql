ALTER TABLE golf_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access on golf_holes" ON golf_holes;
CREATE POLICY "Allow public access on golf_holes" ON golf_holes 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access on golf_scores" ON golf_scores;
CREATE POLICY "Allow public access on golf_scores" ON golf_scores 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);