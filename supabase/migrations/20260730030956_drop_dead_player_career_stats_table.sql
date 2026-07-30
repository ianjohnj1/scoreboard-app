-- player_career_stats was a client-computed cache the app stopped writing to
-- (see 20260729224346_revoke_client_writes_player_career_stats.sql). Nothing
-- reads it either -- the leaderboard/profile stats are fully live-computed
-- from match_events/cricket_player_stats/golf_scores in src/lib/stats.ts.
-- It held only 2 stale test rows. No views depend on it. Drop it.
DROP TABLE IF EXISTS player_career_stats;
