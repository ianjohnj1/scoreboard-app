-- Scores the four event types PoolRoom.tsx (16_ball/8_ball, added
-- 2026-08-01) actually writes: pool_ball_potted, pool_miss, pool_foul,
-- pool_game_won. Without this, points was always 0 for the new pool room
-- (same gap pool_frame had before 20260731212631), so placement/season-points
-- ranking within a pool match was arbitrary rather than driven by play.
--
-- Scoring rule:
--   pool_ball_potted: 1 point, but only when event_data.own_ball is true.
--     A ball potted for the opponent's group (own_ball=false) benefits the
--     opponent's clearance, not the shooter's score - see poolEngine.ts's
--     applyPoolPot. The legal game-winning black ball is own_ball=true too,
--     so it scores like any other own-group ball; the illegal-early-black
--     foul is own_ball=false, so it scores nothing for the player who just
--     lost by fouling.
--   pool_miss / pool_foul: 0 (no branch - falls through to the ELSE, same
--     as every other no-op event type in this function).
--   pool_game_won: a flat 7-point bonus to the winner, regardless of
--     payload. 7 is not arbitrary: a legal win requires clearing all 7 of
--     your own group (7 points from pots alone, before the bonus), and a
--     player who *loses* via the illegal-early-black foul can have at most
--     6 own-group balls potted (a 7th would have made their black attempt
--     legal, i.e. a win, not a foul) - so the winner's total is always
--     strictly greater than the loser's, event order and match length
--     aside. Matches winner_profile_id/winner_team_id independently either
--     way (matches_won/matches_lost already come from those columns, not
--     from points - see getGlobalLeaderboardData() in stats.ts), so this is
--     about placement/season-points ranking agreeing with the actual result,
--     not about determining it.
--
-- Deliberately out of scope here (tracked in todo.md): a dedicated
-- balls-potted/fouls/streak counter column in the view, and win-rate-by-group
-- or win-rate-when-broke-first aggregates - those need their own column(s)
-- and GlobalPlayerStats/UI wiring, not just a points branch.

CREATE OR REPLACE FUNCTION public.match_event_points(p_event_type text, p_event_data jsonb, p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_event_type = 'chip_off_score' THEN jsonb_num(p_event_data, 'points')
    WHEN p_event_type IN ('darts_turn', 'darts_bust', 'darts_throw', 'darts_win')
      THEN darts_event_score(p_event_data)
    WHEN p_event_type = 'darts_atw_throw' THEN jsonb_num(p_event_data, 'advanced_by')
    WHEN p_event_type = 'darts_killer_throw' THEN 10 * (
      CASE WHEN jsonb_typeof(p_event_data -> 'eliminated_player_ids') = 'array'
           THEN jsonb_array_length(p_event_data -> 'eliminated_player_ids')
           ELSE 0 END)
    WHEN p_event_type = 'tt_point' THEN 1
    WHEN p_event_type = 'pool_frame' THEN 1
    WHEN p_event_type = 'pool_ball_potted' AND (p_event_data ->> 'own_ball')::boolean IS TRUE THEN 1
    WHEN p_event_type = 'pool_game_won' THEN 7
    WHEN p_event_type = 'bball_score' THEN jsonb_num(p_event_data, 'pts')
    -- cards_round keys its per-player scores by profile id. Note the client
    -- can never actually reach this branch: cards_round events carry no
    -- player_id, no event_data.player, and no team_id, so routing drops them
    -- before scoring. Ported anyway so the rule stays in one place if that
    -- routing bug is ever fixed (tracked in todo.md).
    WHEN p_event_type = 'cards_round' AND p_profile_id IS NOT NULL
      THEN jsonb_num(p_event_data -> 'round', p_profile_id::text)
    WHEN p_event_type = 'custom_score' THEN jsonb_num(p_event_data, 'value')
    -- `amount || 1` in JS: an explicit 0 is falsy, so it scores 1, not 0.
    WHEN p_event_type IN ('point', 'score')
      THEN CASE WHEN jsonb_num(p_event_data, 'amount') = 0
                THEN 1 ELSE jsonb_num(p_event_data, 'amount') END
    ELSE 0
  END;
$function$;

CREATE OR REPLACE VIEW public.leaderboard_match_player_scores AS
WITH scored_matches AS (
  SELECT id AS match_id
  FROM match_rooms
  WHERE status = 'completed' AND is_practice = false
),
ordered_players AS (
  SELECT
    mp.match_id,
    mp.profile_id,
    mp.team_id,
    (row_number() OVER (PARTITION BY mp.match_id ORDER BY mp.created_at, mp.id)) - 1 AS player_index
  FROM match_players mp
  WHERE mp.match_id IN (SELECT match_id FROM scored_matches)
),
events_routed AS (
  SELECT e.match_id, e.event_type, e.event_data, tgt.profile_id
  FROM match_events e
  CROSS JOIN LATERAL (
    SELECT e.player_id AS profile_id
     WHERE e.player_id IS NOT NULL

    UNION ALL

    SELECT op.profile_id
      FROM ordered_players op
     WHERE e.player_id IS NULL
       AND jsonb_typeof(e.event_data -> 'player') = 'number'
       AND op.match_id = e.match_id
       AND op.player_index = (e.event_data ->> 'player')::int

    UNION ALL

    SELECT op.profile_id
      FROM ordered_players op
     WHERE e.player_id IS NULL
       AND e.team_id IS NOT NULL
       AND op.match_id = e.match_id
       AND op.team_id = e.team_id
       AND NOT EXISTS (
         SELECT 1 FROM ordered_players op2
          WHERE op2.match_id = e.match_id
            AND jsonb_typeof(e.event_data -> 'player') = 'number'
            AND op2.player_index = (e.event_data ->> 'player')::int
       )
  ) tgt
  WHERE e.is_undone = false
    AND e.match_id IN (SELECT match_id FROM scored_matches)
),
event_totals AS (
  SELECT
    r.match_id,
    r.profile_id,
    sum(CASE
      WHEN r.event_type = 'chip_off_score' THEN jsonb_num(r.event_data, 'points')
      WHEN r.event_type IN ('darts_turn', 'darts_bust', 'darts_throw', 'darts_win')
        THEN darts_event_score(r.event_data)
      WHEN r.event_type = 'darts_atw_throw' THEN jsonb_num(r.event_data, 'advanced_by')
      WHEN r.event_type = 'darts_killer_throw' THEN 10 * (
        CASE WHEN jsonb_typeof(r.event_data -> 'eliminated_player_ids') = 'array'
             THEN jsonb_array_length(r.event_data -> 'eliminated_player_ids')
             ELSE 0 END)
      WHEN r.event_type = 'tt_point' THEN 1
      WHEN r.event_type = 'pool_frame' THEN 1
      WHEN r.event_type = 'pool_ball_potted' AND (r.event_data ->> 'own_ball')::boolean IS TRUE THEN 1
      WHEN r.event_type = 'pool_game_won' THEN 7
      WHEN r.event_type = 'bball_score' THEN jsonb_num(r.event_data, 'pts')
      WHEN r.event_type = 'cards_round'
        THEN jsonb_num(r.event_data -> 'round', r.profile_id::text)
      WHEN r.event_type = 'custom_score' THEN jsonb_num(r.event_data, 'value')
      -- `amount || 1` in JS: an explicit 0 is falsy and scores 1.
      WHEN r.event_type IN ('point', 'score')
        THEN CASE WHEN jsonb_num(r.event_data, 'amount') = 0
                  THEN 1 ELSE jsonb_num(r.event_data, 'amount') END
      ELSE 0
    END) AS points,
    sum(CASE WHEN r.event_type = 'delivery'
             THEN jsonb_num(r.event_data, 'runs') ELSE 0 END) AS runs,
    sum(CASE WHEN r.event_type = 'golf_score'
             THEN jsonb_num(r.event_data, 'strokes') ELSE 0 END) AS strokes,
    sum(CASE WHEN r.event_type = 'golf_score'
              AND (r.event_data ->> 'holeInOne')::boolean IS TRUE
             THEN 1 ELSE 0 END) AS hio,
    sum(CASE WHEN r.event_type = 'chip_off_score'
              AND jsonb_num(r.event_data, 'points') = 10
             THEN 1 ELSE 0 END) AS tens,
    sum(CASE WHEN r.event_type = 'putt_attempt'
              AND r.event_data ->> 'outcome' = 'holed'
             THEN 1 ELSE 0 END) AS holed_putts_total
  FROM events_routed r
  GROUP BY r.match_id, r.profile_id
),
wicket_totals AS (
  SELECT
    e.match_id,
    (e.event_data ->> 'dismissedBy')::uuid AS profile_id,
    count(*) AS wickets
  FROM match_events e
  WHERE e.is_undone = false
    AND e.event_type = 'wicket'
    AND e.event_data ->> 'dismissedBy' IS NOT NULL
    AND e.match_id IN (SELECT match_id FROM scored_matches)
  GROUP BY 1, 2
),
cricket_totals AS (
  SELECT
    cps.match_id,
    cps.profile_id,
    sum(COALESCE(cps.bat_runs, 0))     AS runs,
    sum(COALESCE(cps.bowl_wickets, 0)) AS wickets
  FROM cricket_player_stats cps
  WHERE cps.match_id IN (SELECT match_id FROM scored_matches)
  GROUP BY 1, 2
)
SELECT
  op.match_id,
  op.profile_id,
  op.team_id,
  CASE WHEN mr.sport = 'cricket' THEN 0
       ELSE COALESCE(et.points, 0) END::numeric            AS points,
  CASE WHEN mr.sport = 'cricket' THEN COALESCE(ct.runs, 0)
       ELSE COALESCE(et.runs, 0) END::numeric              AS runs,
  CASE WHEN mr.sport = 'cricket' THEN COALESCE(ct.wickets, 0)
       ELSE COALESCE(wt.wickets, 0) END::numeric           AS wickets,
  CASE WHEN mr.sport = 'cricket' THEN 0
       ELSE COALESCE(et.strokes, 0) END::numeric           AS strokes,
  CASE WHEN mr.sport = 'cricket' THEN 0
       ELSE COALESCE(et.hio, 0) END::numeric               AS hio,
  CASE WHEN mr.sport = 'cricket' THEN 0
       ELSE COALESCE(et.tens, 0) END::numeric              AS tens,
  CASE WHEN mr.sport = 'cricket' THEN 0
       ELSE COALESCE(et.holed_putts_total, 0) END::numeric AS holed_putts_total
FROM ordered_players op
JOIN match_rooms mr ON mr.id = op.match_id
LEFT JOIN event_totals et
       ON et.match_id = op.match_id AND et.profile_id = op.profile_id
LEFT JOIN wicket_totals wt
       ON wt.match_id = op.match_id AND wt.profile_id = op.profile_id
LEFT JOIN cricket_totals ct
       ON ct.match_id = op.match_id AND ct.profile_id = op.profile_id;

GRANT SELECT ON public.leaderboard_match_player_scores TO anon, authenticated;
