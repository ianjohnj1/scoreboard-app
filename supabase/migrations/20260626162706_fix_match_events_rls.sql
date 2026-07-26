-- Historical migration, recovered 2026-07-26 while reconciling migration
-- history (see docs/rls-ground-rules.md). The USING(true) policy below was
-- later dropped and replaced by host/scorer-aware policies, then further
-- tightened for DELETE in 20260723000005_fix_match_events_delete_rls.sql -
-- confirmed via live pg_policies that this policy name doesn't exist today.
-- Kept for historical accuracy; do not treat this as the current RLS.

ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access on match_events" ON match_events;
CREATE POLICY "Allow public access on match_events" ON match_events 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
