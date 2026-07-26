-- Historical migration, recovered 2026-07-26 while reconciling migration
-- history (see docs/rls-ground-rules.md). The USING(true) policy below was
-- later dropped and replaced by owner-scoped insert/update policies plus a
-- public-read policy - confirmed via live pg_policies that this policy name
-- doesn't exist today. Kept for historical accuracy; do not treat this as
-- the current player_career_stats RLS.

ALTER TABLE player_career_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access on player_career_stats" ON player_career_stats;
CREATE POLICY "Allow public access on player_career_stats" ON player_career_stats 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
