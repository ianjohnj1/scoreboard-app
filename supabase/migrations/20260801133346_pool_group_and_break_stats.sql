-- Wires up the two pool stats left open in todo.md's "Future features"
-- section after the 2026-08-01 pool rebuild: win % when Bigs vs Smalls, and
-- win % when broke first. Both are derivable purely from the existing
-- match_events log - no new event type or client change needed.
--
-- Group assignment (poolEngine.ts's ballGroupOf()/applyPoolPot): whichever
-- side pots the first non-8 ball is assigned that ball's group, and the
-- opposite side gets the other group. That first qualifying pool_ball_potted
-- event already carries event_data.group, so this reads it directly rather
-- than recomputing the ball->group mapping. A match where the table never
-- legally opens (an illegal early-black foul on the very first shot) has no
-- such event, so both sides get a NULL group rather than a false 0.
--
-- Broke first: side 0 always shoots first (poolEngine.ts's
-- createPoolState/currentSideIndex), so the breaker is whoever the match's
-- earliest live event (by sequence_num) belongs to. Scoped to the three
-- shot-producing event types (pool_ball_potted/pool_miss/pool_foul) rather
-- than any event type, so a legacy pool_frame-only match (PoolFramesRoom.tsx,
-- no per-shot concept at all) can't be misattributed a "break" from its first
-- frame-tally event.
--
-- Both stats are per-roster-player booleans/labels on the same view rather
-- than a separate aggregate, mirroring how wicket_totals/cricket_totals are
-- joined in below - GlobalPlayerStats in stats.ts turns these into lifetime
-- won/played counters the same way it already does for cricket/golf.

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
),
pool_matches AS (
  SELECT id AS match_id FROM match_rooms
  WHERE status = 'completed' AND is_practice = false AND sport = 'pool'
),
-- Whoever the match's earliest live shot-event belongs to broke. Restricted
-- to the three shot-producing types so a legacy pool_frame match (no
-- per-shot log) can't surface a false breaker.
pool_break AS (
  SELECT DISTINCT ON (e.match_id)
    e.match_id, e.player_id AS breaker_profile_id, e.team_id AS breaker_team_id
  FROM match_events e
  WHERE e.is_undone = false
    AND e.event_type IN ('pool_ball_potted', 'pool_miss', 'pool_foul')
    AND e.match_id IN (SELECT match_id FROM pool_matches)
  ORDER BY e.match_id, e.sequence_num ASC
),
-- The first non-8 pot is what opens the table and assigns groups (see
-- poolEngine.ts's applyPoolPot). No such event exists if the match ended via
-- an illegal early-black foul before the table ever opened.
pool_group_open AS (
  SELECT DISTINCT ON (e.match_id)
    e.match_id,
    e.player_id AS opener_profile_id,
    e.team_id AS opener_team_id,
    e.event_data ->> 'group' AS opener_group
  FROM match_events e
  WHERE e.is_undone = false
    AND e.event_type = 'pool_ball_potted'
    AND (e.event_data ->> 'ball')::int <> 8
    AND e.match_id IN (SELECT match_id FROM pool_matches)
  ORDER BY e.match_id, e.sequence_num ASC
),
-- Pool is always exactly two-sided (poolEngine.ts's PoolSideConfig tuple), so
-- "the other side" is unambiguous: the other match_teams row in team mode, or
-- the other individual (team_id IS NULL) match_players row otherwise.
pool_other_side AS (
  SELECT
    go.match_id,
    (SELECT mt.id FROM match_teams mt
      WHERE mt.match_id = go.match_id AND mt.id <> go.opener_team_id
      LIMIT 1) AS other_team_id,
    (SELECT mp.profile_id FROM match_players mp
      WHERE mp.match_id = go.match_id AND mp.team_id IS NULL AND mp.profile_id <> go.opener_profile_id
      LIMIT 1) AS other_profile_id
  FROM pool_group_open go
)
-- One row per (match, roster player), zeros included - the client iterates
-- its roster and falls back to a zeroed accumulator, so absent players must
-- still appear.
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
       ELSE COALESCE(et.holed_putts_total, 0) END::numeric AS holed_putts_total,
  CASE WHEN mr.sport = 'pool' THEN
    CASE
      WHEN pb.breaker_team_id IS NOT NULL THEN (op.team_id = pb.breaker_team_id)
      WHEN pb.breaker_profile_id IS NOT NULL THEN (op.profile_id = pb.breaker_profile_id)
      ELSE NULL
    END
  END AS pool_broke_first,
  CASE WHEN mr.sport = 'pool' THEN
    CASE
      WHEN pgo.opener_team_id IS NOT NULL AND op.team_id = pgo.opener_team_id THEN pgo.opener_group
      WHEN pgo.opener_team_id IS NOT NULL AND op.team_id = pos.other_team_id
        THEN (CASE pgo.opener_group WHEN 'bigs' THEN 'smalls' WHEN 'smalls' THEN 'bigs' ELSE NULL END)
      WHEN pgo.opener_team_id IS NULL AND pgo.opener_profile_id IS NOT NULL
           AND op.profile_id = pgo.opener_profile_id THEN pgo.opener_group
      WHEN pgo.opener_team_id IS NULL AND pgo.opener_profile_id IS NOT NULL
           AND op.profile_id = pos.other_profile_id
        THEN (CASE pgo.opener_group WHEN 'bigs' THEN 'smalls' WHEN 'smalls' THEN 'bigs' ELSE NULL END)
      ELSE NULL
    END
  END AS pool_group
FROM ordered_players op
JOIN match_rooms mr ON mr.id = op.match_id
LEFT JOIN event_totals et
       ON et.match_id = op.match_id AND et.profile_id = op.profile_id
LEFT JOIN wicket_totals wt
       ON wt.match_id = op.match_id AND wt.profile_id = op.profile_id
LEFT JOIN cricket_totals ct
       ON ct.match_id = op.match_id AND ct.profile_id = op.profile_id
LEFT JOIN pool_break pb
       ON pb.match_id = op.match_id
LEFT JOIN pool_group_open pgo
       ON pgo.match_id = op.match_id
LEFT JOIN pool_other_side pos
       ON pos.match_id = op.match_id;

GRANT SELECT ON public.leaderboard_match_player_scores TO anon, authenticated;
