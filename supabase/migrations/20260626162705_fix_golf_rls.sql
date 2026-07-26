-- Historical migration, recovered 2026-07-26 while reconciling migration
-- history (see docs/rls-ground-rules.md). The USING(true) policies below were
-- later dropped and replaced by scorer/host-aware policies during the
-- 2026-07-22/23 security audit and RLS lockdown - confirmed via live
-- pg_policies that none of these policy names exist today. Kept for
-- historical accuracy; do not treat this as the current golf RLS.

ALTER TABLE golf_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access on golf_holes" ON golf_holes;
CREATE POLICY "Allow public access on golf_holes" ON golf_holes 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access on golf_scores" ON golf_scores;
CREATE POLICY "Allow public access on golf_scores" ON golf_scores 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);