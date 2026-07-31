-- pgTAP tests for public.match_event_points(), the single function that
-- decides what a match_event is worth toward the leaderboard (see
-- supabase/migrations/20260730143429_extract_match_event_points_function.sql).
-- It was extracted specifically to be callable against synthetic jsonb with
-- no rows written anywhere - this file is that harness, checked in so it's
-- repeatable instead of run once by hand. The live database currently holds
-- only 3 of the 14 branches below (chip_off_score, golf_score routes through
-- a different column entirely, bball_score); the other branches have zero
-- live-data coverage, which is exactly what this file exists to close.
--
-- Run locally: `supabase start` then `supabase test db`.
-- Run against a project directly: enable the pgtap extension and execute
-- this file with psql/execute_sql - every assertion reads via SELECT only,
-- and the whole file is one transaction that's always rolled back, so it
-- writes nothing durable either way.

begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

-- Signature: pins the contract so a future edit that changes the argument
-- order or return type fails loudly here instead of via a silent leaderboard
-- miscalculation.
select has_function(
  'public', 'match_event_points', ARRAY['text', 'jsonb', 'uuid'],
  'match_event_points(text, jsonb, uuid) should exist'
);
select function_returns(
  'public', 'match_event_points', ARRAY['text', 'jsonb', 'uuid'], 'numeric',
  'match_event_points should return numeric'
);

-- chip_off_score: jsonb_num(data, 'points')
select is(
  match_event_points('chip_off_score', '{"points": 8}'::jsonb),
  8::numeric, 'chip_off_score: reads points directly'
);
select is(
  match_event_points('chip_off_score', '{}'::jsonb),
  0::numeric, 'chip_off_score: missing points falls back to 0'
);
select is(
  match_event_points('chip_off_score', '{"points": "eight"}'::jsonb),
  0::numeric, 'chip_off_score: non-numeric points falls back to 0'
);

-- darts_turn / darts_bust / darts_throw / darts_win all route through
-- darts_event_score() - confirm all four are still in the IN-list, then
-- exercise darts_event_score's own single-throw / darts-array branches once.
select is(
  match_event_points('darts_turn', '{"throw": {"scoredPoints": 60}}'::jsonb),
  60::numeric, 'darts_turn: single throw.scoredPoints'
);
select is(
  match_event_points('darts_bust', '{"throw": {"scoredPoints": 26}}'::jsonb),
  26::numeric, 'darts_bust: single throw.scoredPoints'
);
select is(
  match_event_points('darts_throw', '{"throw": {"scoredPoints": 45}}'::jsonb),
  45::numeric, 'darts_throw: single throw.scoredPoints'
);
select is(
  match_event_points('darts_win', '{"throw": {"scoredPoints": 40}}'::jsonb),
  40::numeric, 'darts_win: single throw.scoredPoints'
);
select is(
  match_event_points('darts_turn', '{"darts": [5, 10, 0]}'::jsonb),
  15::numeric, 'darts_turn: sums a darts array of raw numbers'
);
select is(
  match_event_points('darts_turn', '{"darts": [{"scoredPoints": 20}, {"scoredPoints": 1}]}'::jsonb),
  21::numeric, 'darts_turn: sums a darts array of {scoredPoints} objects'
);
select is(
  match_event_points('darts_turn', '{}'::jsonb),
  0::numeric, 'darts_turn: neither throw nor darts present falls back to 0'
);

-- darts_atw_throw: jsonb_num(data, 'advanced_by')
select is(
  match_event_points('darts_atw_throw', '{"advanced_by": 3}'::jsonb),
  3::numeric, 'darts_atw_throw: reads advanced_by directly'
);
select is(
  match_event_points('darts_atw_throw', '{}'::jsonb),
  0::numeric, 'darts_atw_throw: missing advanced_by falls back to 0'
);

-- darts_killer_throw: 10 points per name in eliminated_player_ids
select is(
  match_event_points('darts_killer_throw', '{"eliminated_player_ids": []}'::jsonb),
  0::numeric, 'darts_killer_throw: empty eliminations scores 0'
);
select is(
  match_event_points('darts_killer_throw', '{"eliminated_player_ids": ["a"]}'::jsonb),
  10::numeric, 'darts_killer_throw: one elimination scores 10'
);
select is(
  match_event_points('darts_killer_throw', '{"eliminated_player_ids": ["a", "b"]}'::jsonb),
  20::numeric, 'darts_killer_throw: two eliminations score 20'
);
select is(
  match_event_points('darts_killer_throw', '{}'::jsonb),
  0::numeric, 'darts_killer_throw: missing/non-array eliminated_player_ids scores 0'
);

-- tt_point: flat 1, regardless of payload
select is(
  match_event_points('tt_point', null),
  1::numeric, 'tt_point: scores 1 even with null event_data'
);
select is(
  match_event_points('tt_point', '{"anything": "ignored"}'::jsonb),
  1::numeric, 'tt_point: scores 1 regardless of payload content'
);

-- pool_frame: flat 1, same shape as tt_point. Each event already carries the
-- winning team's team_id (see PoolRoom.tsx), so routing fans it to the right
-- roster on its own - this branch only had to stop returning 0.
select is(
  match_event_points('pool_frame', '{"winner": 0, "frames": [3, 1]}'::jsonb),
  1::numeric, 'pool_frame: scores 1 regardless of the running frames tally'
);
select is(
  match_event_points('pool_frame', null),
  1::numeric, 'pool_frame: scores 1 even with null event_data'
);

-- bball_score: jsonb_num(data, 'pts')
select is(
  match_event_points('bball_score', '{"pts": 24}'::jsonb),
  24::numeric, 'bball_score: reads pts directly'
);
select is(
  match_event_points('bball_score', '{}'::jsonb),
  0::numeric, 'bball_score: missing pts falls back to 0'
);

-- cards_round: keyed by profile id inside data.round. The client can never
-- actually reach this branch (routing drops cards_round events before
-- scoring, see todo.md), but the rule is tested anyway so it stays correct
-- if that routing bug is ever fixed.
select is(
  match_event_points(
    'cards_round', '{"round": {"11111111-1111-1111-1111-111111111111": 15}}'::jsonb,
    '11111111-1111-1111-1111-111111111111'::uuid
  ),
  15::numeric, 'cards_round: reads this profile''s entry from round'
);
select is(
  match_event_points(
    'cards_round', '{"round": {"22222222-2222-2222-2222-222222222222": 15}}'::jsonb,
    '11111111-1111-1111-1111-111111111111'::uuid
  ),
  0::numeric, 'cards_round: no entry for this profile falls back to 0'
);
select is(
  match_event_points('cards_round', '{}'::jsonb, '11111111-1111-1111-1111-111111111111'::uuid),
  0::numeric, 'cards_round: missing round object falls back to 0'
);
select is(
  match_event_points('cards_round', '{"round": {"11111111-1111-1111-1111-111111111111": 15}}'::jsonb, null),
  0::numeric, 'cards_round: null profile_id never matches the branch, scores 0'
);

-- custom_score: jsonb_num(data, 'value')
select is(
  match_event_points('custom_score', '{"value": 42}'::jsonb),
  42::numeric, 'custom_score: reads value directly'
);
select is(
  match_event_points('custom_score', '{}'::jsonb),
  0::numeric, 'custom_score: missing value falls back to 0'
);

-- point / score: mirrors the client's `amount || 1` - an explicit 0 (or a
-- missing amount, which jsonb_num also resolves to 0) is JS-falsy and scores
-- 1 instead of 0. Both event types share the branch; check each explicitly
-- so a future split of the two doesn't silently drop the quirk from one.
select is(
  match_event_points('point', '{"amount": 5}'::jsonb),
  5::numeric, 'point: non-zero amount scores as-is'
);
select is(
  match_event_points('point', '{"amount": 0}'::jsonb),
  1::numeric, 'point: explicit 0 amount scores 1 (falsy quirk)'
);
select is(
  match_event_points('point', '{}'::jsonb),
  1::numeric, 'point: missing amount also scores 1 (fallback 0 hits the same quirk)'
);
select is(
  match_event_points('score', '{"amount": 7}'::jsonb),
  7::numeric, 'score: non-zero amount scores as-is'
);
select is(
  match_event_points('score', '{"amount": 0}'::jsonb),
  1::numeric, 'score: explicit 0 amount scores 1 (falsy quirk)'
);
select is(
  match_event_points('score', '{}'::jsonb),
  1::numeric, 'score: missing amount also scores 1 (fallback 0 hits the same quirk)'
);

-- Unmatched event_type: the ELSE branch, and the values that should always
-- land there rather than erroring.
select is(
  match_event_points('some_future_event_type', '{"points": 99}'::jsonb),
  0::numeric, 'unknown event_type scores 0 regardless of payload'
);
select is(
  match_event_points('', null),
  0::numeric, 'empty-string event_type scores 0'
);
select is(
  match_event_points(null, null),
  0::numeric, 'null event_type scores 0 rather than erroring'
);

-- Null event_data on branches that do read it: jsonb_num / darts_event_score
-- must degrade to their fallback instead of raising on a null lookup.
select is(
  match_event_points('chip_off_score', null),
  0::numeric, 'chip_off_score: null event_data falls back to 0, no error'
);
select is(
  match_event_points('darts_turn', null),
  0::numeric, 'darts_turn: null event_data falls back to 0, no error'
);

select * from finish();

rollback;
