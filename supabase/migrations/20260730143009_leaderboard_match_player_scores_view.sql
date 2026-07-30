-- P0-2 (partial): push the leaderboard's per-event score reduction into
-- Postgres so the client stops downloading every match_event ever recorded.
--
-- getGlobalLeaderboardData() in src/lib/stats.ts fetches all match_events for
-- all completed non-practice matches (~163 events/match measured live) and
-- reduces them to seven numbers per player per match. This view does that
-- reduction server-side and returns one row per (match, roster player)
-- instead - roughly 5 rows per match rather than 163 - which is a ~34x cut in
-- leaderboard payload.
--
-- Deliberately NOT ported: placement ranking, season points, milestone SP,
-- lifetime counters and best scores. Those stay in stats.ts, which is the
-- only consumer. The live database currently holds just three event types
-- (chip_off_score, golf_score, bball_score) and two completed non-practice
-- matches, so a full port could not have been verified for the other eleven
-- branches. This view's contract is narrow on purpose: reproduce the client's
-- `playerMap` exactly, so everything downstream of it is untouched.
--
-- Faithfulness notes - this view reproduces the client's behaviour, including
-- these pre-existing quirks, rather than quietly correcting them:
--   * cards_round, tt_set, and non-team custom_score events carry neither a
--     player_id, nor an event_data.player index, nor a team_id, so the
--     client's routing drops them and they never reach the leaderboard. This
--     view drops them the same way. Logged in todo.md as a separate bug.
--   * pool_frame only increments a counter the leaderboard never reads, so
--     pool players score 0. Reproduced as-is.
--   * `amount || 1` for point/score events is JS-falsy, so an explicit
--     amount of 0 scores 1. Mirrored below rather than "fixed".
-- One deliberate difference: event_data.player is a 0-based index into the
-- match roster, and the client indexed into an unordered array (its
-- match_players query has no ORDER BY), so which player an indexed event
-- credited was undefined. Here the roster is ordered by (created_at, id),
-- making it deterministic. Only tt_point routes this way and there are zero
-- table-tennis events live, so nothing observable changes.

-- Mirrors the client's `|| 0` guards: non-numeric or absent -> fallback.
CREATE OR REPLACE FUNCTION public.jsonb_num(data jsonb, key text, fallback numeric DEFAULT 0)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(data -> key) = 'number' THEN (data ->> key)::numeric
    ELSE fallback
  END;
$function$;

-- Port of getDartsEventScore() in stats.ts: a single `throw` with
-- scoredPoints, otherwise the sum over a `darts` array whose entries are
-- either raw numbers or objects with scoredPoints.
CREATE OR REPLACE FUNCTION public.darts_event_score(data jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(data -> 'throw' -> 'scoredPoints') = 'number'
      THEN (data -> 'throw' ->> 'scoredPoints')::numeric
    WHEN jsonb_typeof(data -> 'darts') = 'array'
      THEN COALESCE((
        SELECT sum(CASE
          WHEN jsonb_typeof(d) = 'number' THEN d::text::numeric
          WHEN jsonb_typeof(d -> 'scoredPoints') = 'number' THEN (d ->> 'scoredPoints')::numeric
          ELSE 0
        END)
        FROM jsonb_array_elements(data -> 'darts') d
      ), 0)
    ELSE 0
  END;
$function$;

DROP VIEW IF EXISTS public.leaderboard_match_player_scores;

CREATE VIEW public.leaderboard_match_player_scores AS
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
-- The client's three-step routing, in order: an explicit player_id wins;
-- otherwise event_data.player as a roster index; otherwise team_id, fanning
-- the event out to every player on that team. An event matching none of the
-- three is dropped.
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
       -- only when the roster-index step above resolved to nothing
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
-- Wickets are credited to event_data.dismissedBy (the bowler), not to the
-- player the event routed to, exactly as the client's `wicket` case does.
-- The client discards wickets for a bowler who isn't on the roster, because
-- it only reads playerMap back for roster members - the join below does the
-- same.
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
-- Cricket never touches match_events in the client: getGlobalLeaderboardData()
-- branches on sport and reads the normalised cricket_player_stats side table
-- instead, summing bat_runs/bowl_wickets across a player's innings rows. The
-- CASE in the final SELECT keeps that split, so a cricket match's delivery and
-- wicket events are ignored here exactly as they are there.
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
       ELSE COALESCE(et.holed_putts_total, 0) END::numeric AS holed_putts_total
FROM ordered_players op
JOIN match_rooms mr ON mr.id = op.match_id
LEFT JOIN event_totals et
       ON et.match_id = op.match_id AND et.profile_id = op.profile_id
LEFT JOIN wicket_totals wt
       ON wt.match_id = op.match_id AND wt.profile_id = op.profile_id
LEFT JOIN cricket_totals ct
       ON ct.match_id = op.match_id AND ct.profile_id = op.profile_id;

-- Same read posture as the match_events/match_players it derives from, all of
-- which are already SELECT-able by everyone (see docs/rls-ground-rules.md).
-- This view exposes strictly less than those tables do.
GRANT SELECT ON public.leaderboard_match_player_scores TO anon, authenticated;
