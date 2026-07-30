-- RLS smoke tests: exercises the two classes of bug docs/rls-ground-rules.md
-- was written about and that this repo has actually shipped twice - an
-- admin-override branch present in one policy but missing from a sibling
-- (see the match_rooms UPDATE / can_score_match() history in CLAUDE.md), and
-- plain ownership isolation (can a stranger touch a match/profile/session
-- that isn't theirs). This is a smoke test, not exhaustive coverage of every
-- policy on every table - it picks one representative case per bug class.
--
-- How identity is simulated: this app has no Supabase Auth/JWTs. RLS policies
-- resolve the caller via get_current_session_profile_id(), which reads the
-- x-session-id request header out of the `request.headers` GUC and looks it
-- up in active_sessions (see CLAUDE.md's "Auth is custom" section). To
-- impersonate a session here we set that same GUC with set_config(...,
-- true) - true scopes it to the current transaction, same as `set local`.
--
-- Executing this file runs as `postgres`, which has BYPASSRLS and would
-- make every policy a no-op. `set local role anon` (this app's traffic never
-- reaches `authenticated` - there's no JWT upgrade) drops that bypass so the
-- policies actually apply, matching what real anon-key traffic experiences.
--
-- Fixture rows (profiles/active_sessions/match_rooms/match_players) are
-- inserted before the role switch, with session_replication_role set to
-- replica so the guard triggers - which forbid self-assigning is_admin at
-- signup, among other things - don't block seeding a synthetic admin
-- profile. Triggers are re-enabled before any assertion runs, since some of
-- what's being tested (profiles self-escalation) is enforced by a trigger,
-- not by RLS alone.
--
-- Everything here is one transaction that always rolls back - see `rollback`
-- at the end - so nothing persists regardless of pass/fail. Fixture ids are
-- fixed, recognizable synthetic UUIDs (all `aaaa…`/`bbbb…`/`cccc…`/`dddd…`)
-- chosen so they'd be obviously fake if a rollback ever failed to fire.
--
-- Run locally: `supabase start` then `supabase test db`.
-- Run against a project: needs the `pgtap` extension enabled there first -
-- see the same note in match_event_points.test.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------
-- Fixtures (not assertions): a host, an admin, a stranger, and a guest
-- profile; one active session per real identity; one match_rooms row
-- hosted by "host"; one match_players row seating "host" as a player.
-- ---------------------------------------------------------------------

set local session_replication_role = replica;

insert into profiles (id, display_name, username, is_admin, is_guest) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'RLS Smoke Host',     'rls_smoke_host',     false, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'RLS Smoke Admin',    'rls_smoke_admin',    true,  false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'RLS Smoke Stranger', 'rls_smoke_stranger', false, false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'RLS Smoke Guest',    'rls_smoke_guest',    false, true);

insert into active_sessions (id, profile_id) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');

insert into match_rooms (id, sport, room_code, created_by, status) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'darts', 'RLSSMK01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'active');

insert into match_players (id, match_id, profile_id, role) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'player');

set local session_replication_role = default;

-- All assertions run as anon - this app's real traffic never becomes
-- `authenticated`. Identity is switched per block via request.headers.
set local role anon;

-- ---------------------------------------------------------------------
-- Group A: admin override. Regression coverage for the exact class of bug
-- CLAUDE.md documents having shipped twice - a policy with an admin branch
-- on one command but not a sibling command on the same table.
-- ---------------------------------------------------------------------

select set_config('request.headers', json_build_object('x-session-id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')::text, true);

select isnt_empty(
  $$ update match_rooms set status = 'paused'
     where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' returning 1 $$,
  'admin can update a match_rooms row they neither host nor joined'
);

select isnt_empty(
  $$ insert into match_events (match_id, event_type, event_data)
     values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'custom_score', '{"value": 1}'::jsonb)
     returning 1 $$,
  'admin can insert a match_events row for a match they neither host nor joined'
);

select results_eq(
  $$ select recorded_by from match_events
     where match_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' and event_type = 'custom_score' $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid) $$,
  'recorded_by is stamped server-side from the session, not left to the client'
);

select isnt_empty(
  $$ insert into match_players (match_id, profile_id, role)
     values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'player')
     returning 1 $$,
  'admin can add a roster player to a match they neither host nor joined'
);

select isnt_empty(
  $$ update match_players set role = 'scorer'
     where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' returning 1 $$,
  'admin can update a roster row on a match they neither host nor joined'
);

-- ---------------------------------------------------------------------
-- Group B: ownership isolation. A stranger - no host/participant/admin
-- relationship to the match or profile at all - should be unable to write
-- to any of it.
-- ---------------------------------------------------------------------

select set_config('request.headers', json_build_object('x-session-id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3')::text, true);

select is_empty(
  $$ update match_rooms set status = 'completed'
     where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' returning 1 $$,
  'stranger cannot update a match_rooms row they have no relationship to'
);

select throws_ok(
  $$ insert into match_events (match_id, event_type, event_data)
     values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'custom_score', '{"value": 1}'::jsonb) $$,
  '42501',
  'new row violates row-level security policy for table "match_events"',
  'stranger cannot insert match_events into a match they cannot score'
);

select is_empty(
  $$ delete from match_rooms
     where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' returning 1 $$,
  'stranger cannot delete a match_rooms row they do not host'
);

select is_empty(
  $$ update profiles set display_name = 'Hacked'
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning 1 $$,
  'stranger cannot update another profile'
);

select is_empty(
  $$ update active_sessions set last_seen = now()
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' returning 1 $$,
  'stranger cannot touch another session'
);

select is_empty(
  $$ delete from active_sessions
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1' returning 1 $$,
  'stranger cannot delete another session'
);

-- ---------------------------------------------------------------------
-- Group C: profiles admin-escalation guard. Nobody - not even an admin
-- session - can self-grant admin through the public write path; the guard
-- trigger and the RLS with_check are independent layers, tested separately.
-- ---------------------------------------------------------------------

-- Two independent layers guard this, but the BEFORE INSERT trigger fires
-- before the RLS with_check ever gets evaluated, so that's the exception
-- that actually surfaces here (see guard_profiles_protected_columns() -
-- the with_check `is_admin = false` on this policy is real defense in
-- depth, just not the one reachable through this path).
select throws_ok(
  $$ insert into profiles (id, display_name, is_admin)
     values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'Self-Made Admin', true) $$,
  'P0001',
  'Cannot self-assign admin at signup',
  'a non-admin session cannot create a new profile with is_admin = true'
);

select set_config('request.headers', json_build_object('x-session-id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')::text, true);

select throws_ok(
  $$ update profiles set is_admin = true
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' $$,
  'P0001',
  'Only an admin session may change is_admin',
  'a host cannot self-escalate their own profile to admin'
);

select set_config('request.headers', json_build_object('x-session-id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')::text, true);

select isnt_empty(
  $$ update profiles set display_name = 'Renamed Guest'
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4' returning 1 $$,
  'admin can update a guest profile'
);

select is_empty(
  $$ update profiles set display_name = 'Renamed Stranger'
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3' returning 1 $$,
  'admin cannot update a non-guest profile that is not their own'
);

-- ---------------------------------------------------------------------
-- Group D: baseline positive cases, so this file also catches an
-- accidental over-lockdown regression, not just a missing admin branch.
-- ---------------------------------------------------------------------

select set_config('request.headers', json_build_object('x-session-id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')::text, true);

select isnt_empty(
  $$ update match_rooms set status = 'paused'
     where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' returning 1 $$,
  'host can update their own match_rooms row'
);

select set_config('request.headers', null, true);

select isnt_empty(
  $$ select 1 from match_rooms where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' $$,
  'match_rooms stays publicly readable with no session at all'
);

select * from finish();

rollback;
