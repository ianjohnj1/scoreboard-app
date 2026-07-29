-- Close the "player can misreport their own numbers" gap: player_career_stats
-- was only ever a client-computed cache. Nothing in the app reads it for
-- display any more (leaderboard/profile analytics are independently
-- recomputed from match_events/cricket_player_stats/golf_scores), and the
-- client no longer writes to it. Drop the write policies entirely - SELECT
-- stays public (existing rows are left as-is), INSERT/UPDATE become
-- default-deny under RLS.
DROP POLICY IF EXISTS "Players can only insert their own career stats" ON player_career_stats;
DROP POLICY IF EXISTS "Players can only update their own career stats" ON player_career_stats;
