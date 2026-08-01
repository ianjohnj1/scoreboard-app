-- Wires up the rest of STATS_AUDIT_LOG.md's Pool "Not yet implemented" list
-- (Fouls, Avg Shots per Pot, Wire-to-Wire Wins, Longest Pot Streak, Shortest
-- Win, Bigs/Smalls assignment counts) and surfaces the win-% stats added in
-- 20260801133346 on ProfilePage too, by extending player_career_analytics -
-- the view ProfilePage.tsx actually reads (leaderboard_match_player_scores/
-- GlobalPlayerStats, touched last time, only feeds LeaderboardPage).
--
-- All of these are derivable from the four persisted pool event types with
-- no new event or client change:
--   * Fouls, Avg Shots per Pot, Wire-to-Wire Wins: plain per-player counts
--     over pool_ball_potted/pool_miss/pool_foul (pool_shot_counts CTE).
--   * Shortest Win: fewest total shots (both sides) across matches this
--     player won - a per-match total (pool_match_shot_counts CTE) joined
--     back and MINed under a WHERE is_win filter, same pattern as golf's
--     best_score_classic in stats.ts.
--   * Bigs/Smalls counts and win%: read directly off
--     leaderboard_match_player_scores's already-verified pool_group/
--     pool_broke_first columns rather than re-deriving group assignment
--     here - one source of truth for that logic.
--   * Longest Pot Streak is the one non-trivial derivation: poolEngine.ts's
--     turn only passes on a miss/foul/opponent-ball pot, so consecutive
--     own-group pots within one continuous turn form a "streak". This is a
--     classic gaps-and-islands query: a running SUM() OVER (ORDER BY
--     sequence_num) that increments on every turn-ending event assigns a
--     stable turn_group id to every event in between two enders (the ender
--     itself lands in the new group, but it never counts toward streak_len
--     since it isn't an own-ball pot, so grouping is safe either way).
--     pool_turn_streaks then counts own-ball pots per (match, player,
--     turn_group) and pool_streaks takes the max per (match, player).
--
-- Verified via a synthetic execute_sql transaction covering a multi-turn
-- streak, an interrupted-then-resumed second turn for the same player, and
-- a wire-to-wire win, always rolled back - no live pool match data exists
-- yet to have any retroactive impact.

CREATE OR REPLACE VIEW public.player_career_analytics AS
WITH player_match_status AS (
    SELECT
        mp.profile_id,
        mr.id as match_id,
        CASE
            WHEN mr.sport = 'golf' AND (mr.house_rules->>'variant') = 'chip_off' THEN 'chip_off'
            WHEN mr.sport = 'golf' AND (mr.house_rules->>'variant') = 'putt_vs_putt' THEN 'putt_vs_putt'
            ELSE mr.sport
        END as sport,
        mr.is_practice,
        CASE
            WHEN mr.winner_profile_id = mp.profile_id THEN 1
            WHEN mr.winner_team_id IS NOT NULL AND mr.winner_team_id = mp.team_id THEN 1
            ELSE 0
        END as is_win,
        CASE WHEN mr.created_by = mp.profile_id AND mr.winner_profile_id = mp.profile_id THEN 1 ELSE 0 END as is_architect_win
    FROM match_players mp
    JOIN match_rooms mr ON mp.match_id = mr.id
    WHERE mr.status = 'completed'
),
cricket_metrics AS (
    SELECT
        profile_id,
        match_id,
        SUM(bat_runs) as cricket_runs,
        SUM(bat_balls) as cricket_balls_faced,
        SUM(bat_dots) as cricket_dots_faced,
        SUM(bat_fours) as cricket_fours,
        SUM(bat_sixes) as cricket_sixes,
        SUM(bowl_balls) as cricket_balls_bowled,
        SUM(bowl_runs) as cricket_runs_conceded,
        SUM(bowl_wickets) as cricket_wickets_taken,
        SUM(bowl_dots) as cricket_dots_bowled
    FROM cricket_player_stats
    GROUP BY profile_id, match_id
),
chip_off_metrics AS (
    SELECT
        me.player_id as profile_id,
        me.match_id,
        SUM((me.event_data->>'points')::int) as chip_off_points,
        COUNT(CASE WHEN (me.event_data->>'points')::int = 10 THEN 1 END) as chip_off_aces,
        COUNT(*) as chip_off_total_chips,
        COUNT(CASE WHEN (me.event_data->>'points')::int IN (2, 5, 10) THEN 1 END) as chip_off_scoring_chips
    FROM match_events me
    WHERE me.is_undone = false AND me.event_type = 'chip_off_score'
    GROUP BY me.player_id, me.match_id
),
pvp_metrics AS (
    SELECT
        pms.profile_id,
        pms.match_id,
        COUNT(CASE WHEN me.event_type = 'putt_attempt' THEN 1 END)::int as total_putt_attempts,
        COUNT(CASE WHEN me.event_type = 'putt_attempt' AND me.event_data->>'outcome' = 'holed' THEN 1 END)::int as holed_putts_total,
        COUNT(CASE WHEN me.event_type = 'tiebreak_result' AND me.player_id = pms.profile_id THEN 1 END)::int as clutch_putts
    FROM player_match_status pms
    LEFT JOIN match_events me
      ON me.match_id = pms.match_id
     AND me.player_id = pms.profile_id
     AND me.is_undone = false
     AND me.event_type IN ('putt_attempt', 'tiebreak_result')
    WHERE pms.sport = 'putt_vs_putt'
    GROUP BY pms.profile_id, pms.match_id
),
darts_countdown_metrics AS (
    SELECT
        profile_id,
        match_id,
        SUM(scored_points) as countdown_points,
        COUNT(*) as countdown_darts,
        SUM(CASE WHEN dart_num <= 9 THEN scored_points ELSE 0 END) as first_nine_points,
        COUNT(CASE WHEN dart_num <= 9 THEN 1 END) as first_nine_darts,
        COUNT(CASE WHEN is_win AND is_double THEN 1 END) as checkout_successes,
        COUNT(CASE WHEN remaining_before <= 50 THEN 1 END) as checkout_attempts
    FROM (
        SELECT
            player_id as profile_id,
            match_id,
            COALESCE((event_data->'throw'->>'scoredPoints')::int, 0) as scored_points,
            event_type = 'darts_win' as is_win,
            event_data->'throw'->>'ring' IN ('double', 'double_bull') as is_double,
            COALESCE((event_data->>'remaining_before')::int, 501) as remaining_before,
            ROW_NUMBER() OVER (PARTITION BY match_id, player_id ORDER BY sequence_num) as dart_num
        FROM match_events
        WHERE is_undone = false AND event_type IN ('darts_turn', 'darts_bust', 'darts_win') AND event_data->>'variant' = 'countdown'
    ) sub
    GROUP BY profile_id, match_id
),
darts_atw_metrics AS (
    SELECT
        player_id as profile_id,
        match_id,
        COUNT(*) as atw_darts,
        COUNT(DISTINCT CASE WHEN (event_data->>'winner_profile_id') = player_id::text THEN match_id END) as atw_wins
    FROM match_events
    WHERE is_undone = false AND event_type = 'darts_atw_throw'
    GROUP BY player_id, match_id
),
darts_killer_metrics AS (
    SELECT
        player_id as profile_id,
        match_id,
        COUNT(CASE WHEN event_data->>'hit_opponent_id' IS NOT NULL THEN 1 END) as killer_lethal_hits,
        COUNT(CASE WHEN (event_data->'assignments'->(player_id::text)->>'isKiller')::text = 'true' OR (event_data->>'activated')::text = 'true' THEN 1 END) as killer_throws,
        COUNT(*) as killer_total_darts
    FROM match_events
    WHERE is_undone = false AND event_type = 'darts_killer_throw'
    GROUP BY player_id, match_id
),
-- Per (player, match) shot counts, straight aggregates over the three
-- shot-producing pool event types.
pool_shot_counts AS (
    SELECT
        e.player_id AS profile_id,
        e.match_id,
        COUNT(*) FILTER (WHERE e.event_type = 'pool_foul') AS pool_fouls,
        COUNT(*) FILTER (WHERE e.event_type = 'pool_miss') AS pool_misses,
        COUNT(*) FILTER (WHERE e.event_type = 'pool_ball_potted' AND (e.event_data ->> 'own_ball')::boolean IS TRUE) AS pool_own_pots,
        COUNT(*) AS pool_total_shots
    FROM match_events e
    WHERE e.is_undone = false
      AND e.event_type IN ('pool_ball_potted', 'pool_miss', 'pool_foul')
      AND e.player_id IS NOT NULL
    GROUP BY e.player_id, e.match_id
),
-- Total shots (both sides combined) per match, for the "shortest win" stat.
pool_match_shot_counts AS (
    SELECT match_id, COUNT(*) AS total_shots
    FROM match_events
    WHERE is_undone = false
      AND event_type IN ('pool_ball_potted', 'pool_miss', 'pool_foul')
    GROUP BY match_id
),
-- Gaps-and-islands: a running count of turn-ending events (miss/foul/potting
-- the opponent's ball) up to and including each row assigns every event a
-- turn_group id that's constant within one continuous turn and strictly
-- higher for every subsequent turn - see poolEngine.ts's endTurn(), which is
-- called on exactly those three cases and never mid-turn otherwise.
pool_streaks AS (
    SELECT match_id, player_id AS profile_id, MAX(streak_len) AS pool_longest_streak
    FROM (
        SELECT match_id, player_id, turn_group,
               COUNT(*) FILTER (
                 WHERE event_type = 'pool_ball_potted' AND (event_data ->> 'own_ball')::boolean IS TRUE
               ) AS streak_len
        FROM (
            SELECT match_id, player_id, event_type, event_data,
                   SUM(CASE
                         WHEN event_type IN ('pool_miss', 'pool_foul') THEN 1
                         WHEN event_type = 'pool_ball_potted' AND (event_data ->> 'own_ball')::boolean IS NOT TRUE THEN 1
                         ELSE 0
                       END) OVER (PARTITION BY match_id ORDER BY sequence_num) AS turn_group
            FROM match_events
            WHERE is_undone = false
              AND event_type IN ('pool_ball_potted', 'pool_miss', 'pool_foul')
        ) shots
        WHERE player_id IS NOT NULL
        GROUP BY match_id, player_id, turn_group
    ) turns
    GROUP BY match_id, player_id
)
SELECT
    pms.profile_id,
    pms.sport,
    pms.is_practice,
    COUNT(*) as matches_played,
    SUM(pms.is_win) as matches_won,
    COUNT(*) - SUM(pms.is_win) as matches_lost,
    SUM(COALESCE(crm.cricket_runs, 0))::int as total_cricket_runs,
    SUM(COALESCE(crm.cricket_balls_faced, 0))::int as total_cricket_balls_faced,
    CASE WHEN SUM(COALESCE(crm.cricket_balls_faced, 0)) > 0 THEN (SUM(COALESCE(crm.cricket_runs, 0))::float / SUM(COALESCE(crm.cricket_balls_faced, 0))) * 100 ELSE 0 END as strike_rate,
    CASE WHEN SUM(COALESCE(crm.cricket_balls_faced, 0)) > 0 THEN (SUM(COALESCE(crm.cricket_dots_faced, 0))::float / SUM(COALESCE(crm.cricket_balls_faced, 0))) * 100 ELSE 0 END as dot_ball_percentage,
    CASE WHEN SUM(COALESCE(crm.cricket_runs, 0)) > 0 THEN ((SUM(COALESCE(crm.cricket_fours, 0)) * 4 + SUM(COALESCE(crm.cricket_sixes, 0)) * 6)::float / SUM(COALESCE(crm.cricket_runs, 0))) * 100 ELSE 0 END as boundary_percentage,
    SUM(COALESCE(crm.cricket_balls_bowled, 0))::int as total_cricket_balls_bowled,
    SUM(COALESCE(crm.cricket_runs_conceded, 0))::int as total_cricket_runs_conceded,
    SUM(COALESCE(crm.cricket_wickets_taken, 0))::int as total_cricket_wickets_taken,
    SUM(COALESCE(crm.cricket_dots_bowled, 0))::int as total_cricket_dots_bowled,
    CASE WHEN SUM(COALESCE(crm.cricket_balls_bowled, 0)) > 0 THEN (SUM(COALESCE(crm.cricket_runs_conceded, 0))::float / (SUM(COALESCE(crm.cricket_balls_bowled, 0))::float / 6)) ELSE 0 END as economy_rate,
    CASE WHEN SUM(COALESCE(crm.cricket_wickets_taken, 0)) > 0 THEN (SUM(COALESCE(crm.cricket_balls_bowled, 0))::float / SUM(COALESCE(crm.cricket_wickets_taken, 0))) ELSE 0 END as bowling_strike_rate,
    SUM(COALESCE(chm.chip_off_points, 0))::int as total_chip_off_points,
    SUM(COALESCE(chm.chip_off_total_chips, 0))::int as total_chip_off_chips,
    CASE WHEN SUM(COALESCE(chm.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(chm.chip_off_points, 0))::float / (SUM(COALESCE(chm.chip_off_total_chips, 0)) * 10)) * 100 ELSE 0 END as scoring_efficiency,
    CASE WHEN SUM(COALESCE(chm.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(chm.chip_off_aces, 0))::float / SUM(COALESCE(chm.chip_off_total_chips, 0))) * 100 ELSE 0 END as ace_frequency,
    CASE WHEN SUM(COALESCE(chm.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(chm.chip_off_scoring_chips, 0))::float / SUM(COALESCE(chm.chip_off_total_chips, 0))) * 100 ELSE 0 END as hazard_avoidance_rating,
    CASE WHEN SUM(COALESCE(chm.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(chm.chip_off_points, 0))::float / SUM(COALESCE(chm.chip_off_total_chips, 0))) ELSE 0 END as average_proximity_tier,
    SUM(COALESCE(pvm.holed_putts_total, 0))::int as holed_putts_total,
    SUM(COALESCE(pvm.total_putt_attempts, 0))::int as total_putt_attempts,
    CASE WHEN SUM(COALESCE(pvm.total_putt_attempts, 0)) > 0 THEN (SUM(COALESCE(pvm.holed_putts_total, 0))::float / SUM(COALESCE(pvm.total_putt_attempts, 0))) * 100 ELSE 0 END as career_pct_holed,
    SUM(COALESCE(pvm.clutch_putts, 0))::int as clutch_putts,
    CASE WHEN SUM(COALESCE(dcm.countdown_darts, 0)) > 0 THEN (SUM(COALESCE(dcm.countdown_points, 0))::float / (SUM(COALESCE(dcm.countdown_darts, 0))::float / 3.0)) ELSE 0 END as countdown_ppr,
    CASE WHEN SUM(COALESCE(dcm.first_nine_darts, 0)) > 0 THEN (SUM(COALESCE(dcm.first_nine_points, 0))::float / (SUM(COALESCE(dcm.first_nine_darts, 0))::float / 3.0)) ELSE 0 END as first_nine_ppr,
    CASE WHEN SUM(COALESCE(dcm.checkout_attempts, 0)) > 0 THEN (SUM(COALESCE(dcm.checkout_successes, 0))::float / SUM(COALESCE(dcm.checkout_attempts, 0))::float) * 100 ELSE 0 END as checkout_pct,
    CASE WHEN SUM(COALESCE(dam.atw_wins, 0)) > 0 THEN (SUM(COALESCE(dam.atw_darts, 0))::float / SUM(COALESCE(dam.atw_wins, 0))::float) ELSE 0 END as atw_efficiency,
    CASE WHEN SUM(COALESCE(dkm.killer_throws, 0)) > 0 THEN (SUM(COALESCE(dkm.killer_lethal_hits, 0))::float / SUM(COALESCE(dkm.killer_throws, 0))::float) * 100 ELSE 0 END as killer_lethality,
    CASE WHEN COUNT(dkm.match_id) > 0 THEN (SUM(COALESCE(dkm.killer_total_darts, 0))::float / 3.0) / COUNT(dkm.match_id)::float ELSE 0 END as killer_survival,
    SUM(COALESCE(pmm.pool_fouls, 0))::int as total_pool_fouls,
    SUM(COALESCE(pmm.pool_total_shots, 0))::int as total_pool_shots,
    CASE WHEN SUM(COALESCE(pmm.pool_own_pots, 0)) > 0
         THEN SUM(COALESCE(pmm.pool_total_shots, 0))::float / SUM(COALESCE(pmm.pool_own_pots, 0))
         ELSE 0 END as pool_avg_shots_per_pot,
    SUM(CASE
          WHEN pms.is_win = 1 AND pmm.match_id IS NOT NULL
               AND COALESCE(pmm.pool_fouls, 0) = 0 AND COALESCE(pmm.pool_misses, 0) = 0
          THEN 1 ELSE 0 END)::int as pool_wire_to_wire_wins,
    MAX(COALESCE(pst.pool_longest_streak, 0))::int as pool_longest_streak,
    MIN(pmc.total_shots) FILTER (WHERE pms.is_win = 1) as pool_shortest_win_shots,
    SUM(CASE WHEN lmps.pool_group = 'bigs' THEN 1 ELSE 0 END)::int as pool_matches_as_bigs,
    SUM(CASE WHEN lmps.pool_group = 'bigs' AND pms.is_win = 1 THEN 1 ELSE 0 END)::int as pool_wins_as_bigs,
    SUM(CASE WHEN lmps.pool_group = 'smalls' THEN 1 ELSE 0 END)::int as pool_matches_as_smalls,
    SUM(CASE WHEN lmps.pool_group = 'smalls' AND pms.is_win = 1 THEN 1 ELSE 0 END)::int as pool_wins_as_smalls,
    SUM(CASE WHEN lmps.pool_broke_first THEN 1 ELSE 0 END)::int as pool_matches_broke_first,
    SUM(CASE WHEN lmps.pool_broke_first AND pms.is_win = 1 THEN 1 ELSE 0 END)::int as pool_wins_broke_first
FROM player_match_status pms
LEFT JOIN cricket_metrics crm ON pms.profile_id = crm.profile_id AND pms.match_id = crm.match_id
LEFT JOIN chip_off_metrics chm ON pms.profile_id = chm.profile_id AND pms.match_id = chm.match_id
LEFT JOIN pvp_metrics pvm ON pms.profile_id = pvm.profile_id AND pms.match_id = pvm.match_id
LEFT JOIN darts_countdown_metrics dcm ON pms.profile_id = dcm.profile_id AND pms.match_id = dcm.match_id
LEFT JOIN darts_atw_metrics dam ON pms.profile_id = dam.profile_id AND pms.match_id = dam.match_id
LEFT JOIN darts_killer_metrics dkm ON pms.profile_id = dkm.profile_id AND pms.match_id = dkm.match_id
LEFT JOIN pool_shot_counts pmm ON pms.profile_id = pmm.profile_id AND pms.match_id = pmm.match_id
LEFT JOIN pool_match_shot_counts pmc ON pms.match_id = pmc.match_id
LEFT JOIN pool_streaks pst ON pms.profile_id = pst.profile_id AND pms.match_id = pst.match_id
LEFT JOIN leaderboard_match_player_scores lmps ON pms.profile_id = lmps.profile_id AND pms.match_id = lmps.match_id
GROUP BY pms.profile_id, pms.sport, pms.is_practice;
