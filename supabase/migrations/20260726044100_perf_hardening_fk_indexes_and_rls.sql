-- Low-risk performance hardening from a Postgres best-practices audit run against
-- the live schema (pg_policies + Supabase advisors), 2026-07-26. All three changes
-- are additive/behavior-preserving: new indexes, RLS policies rewritten to the
-- same semantics with per-statement (not per-row) evaluation, and a search_path
-- pin on an existing trigger function. Nothing here changes what any query
-- returns or who can do what - see docs/rls-ground-rules.md for the broader RLS
-- conventions this follows.
--
-- Explicitly out of scope (flagged in the audit but needs more thought, not a
-- quick fix): player_career_analytics/fan_engagement_stats being SECURITY
-- DEFINER views that bypass RLS on their source tables, and the public
-- `avatars` storage bucket allowing object listing.

-- ============================================================================
-- 1. Cover every foreign key with an index.
-- Postgres does not do this automatically. None of these tables are large yet
-- (largest is match_events at ~1k rows), so a plain (non-CONCURRENT) CREATE
-- INDEX is fine - the lock is momentary. IF NOT EXISTS makes this safe to
-- re-run.
-- ============================================================================

create index if not exists idx_active_sessions_match_id on public.active_sessions (match_id);

create index if not exists idx_cricket_innings_match_id on public.cricket_innings (match_id);
create index if not exists idx_cricket_innings_batting_team_id on public.cricket_innings (batting_team_id);
create index if not exists idx_cricket_innings_bowling_team_id on public.cricket_innings (bowling_team_id);
create index if not exists idx_cricket_innings_current_batter1_id on public.cricket_innings (current_batter1_id);
create index if not exists idx_cricket_innings_current_batter2_id on public.cricket_innings (current_batter2_id);
create index if not exists idx_cricket_innings_current_bowler_id on public.cricket_innings (current_bowler_id);

create index if not exists idx_cricket_player_stats_bat_dismissed_by on public.cricket_player_stats (bat_dismissed_by);
create index if not exists idx_cricket_player_stats_bat_fielded_by on public.cricket_player_stats (bat_fielded_by);

create index if not exists idx_event_rsvps_player_id on public.event_rsvps (player_id);
create index if not exists idx_events_created_by on public.events (created_by);

create index if not exists idx_golf_scores_profile_id on public.golf_scores (profile_id);

create index if not exists idx_match_events_player_id on public.match_events (player_id);
create index if not exists idx_match_events_recorded_by on public.match_events (recorded_by);
create index if not exists idx_match_events_team_id on public.match_events (team_id);

create index if not exists idx_match_players_team_id on public.match_players (team_id);
create index if not exists idx_match_rooms_created_by on public.match_rooms (created_by);
create index if not exists idx_match_teams_match_id on public.match_teams (match_id);

create index if not exists idx_profiles_linked_profile_id on public.profiles (linked_profile_id);
create index if not exists idx_profiles_user_id on public.profiles (user_id);

-- ============================================================================
-- 2. active_sessions RLS: cache the session-header lookup per statement.
-- Both policies previously called current_setting('request.headers', true)
-- directly in USING/WITH CHECK, which Postgres re-evaluates for every row
-- scanned. Wrapping it in (select ...) lets the planner evaluate it once per
-- statement (InitPlan) instead - same semantics, just cached. This is the one
-- table where it's worth doing now: it takes a write from every client's 30s
-- auth heartbeat (see AuthContext.tsx), so it's the busiest table by write
-- volume even though it's not the largest by row count.
-- ============================================================================

alter policy "Users can update their own session" on public.active_sessions
  using ((id)::text = (select (current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text))
  with check ((id)::text = (select (current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

alter policy "Users can delete their own session" on public.active_sessions
  using ((id)::text = (select (current_setting('request.headers'::text, true))::json ->> 'x-session-id'::text));

-- ============================================================================
-- 3. Pin search_path on rate_limit_check().
-- Not SECURITY DEFINER (it's SECURITY INVOKER, so the blast radius is smaller
-- than the SECURITY DEFINER functions docs/rls-ground-rules.md already covers),
-- but it's a BEFORE INSERT trigger on match_events that calls
-- get_current_session_profile_id() and queries match_events unqualified, so it
-- should still resolve those names from a fixed schema rather than whatever
-- search_path the calling session happens to have.
-- ============================================================================

alter function public.rate_limit_check() set search_path = public, pg_temp;
