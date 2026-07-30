-- active_sessions was never garbage-collected: 316 rows for 10 distinct
-- profiles, 313 stale by more than 7 days (307 of those on a single
-- profile - almost certainly dev/test churn, not real users; every other
-- profile correctly has exactly one row, since rpc_login's session reuse
-- logic works as intended). Every RLS check that resolves the caller reads
-- this table via get_current_session_profile_id(), so it's worth keeping
-- small even though it isn't binding yet at this size.
--
-- Enables Supabase Cron (pg_cron) and schedules a daily job deleting rows
-- with last_seen older than 7 days, per the standard install snippet
-- (https://supabase.com/docs/guides/cron/install). Runs at 03:00 UTC,
-- a low-traffic hour for this app's timezone. cron.schedule() upserts by
-- job name, so re-running this migration is safe.
--
-- Also runs the same delete once immediately, to clear the existing
-- backlog rather than leaving it for the first scheduled run - safe to do
-- live: a session stale by more than 7 days belongs to a browser that
-- hasn't touched the app in a week, so removing the bookkeeping row logs
-- out nothing currently active.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

SELECT cron.schedule(
  'cleanup-stale-active-sessions',
  '0 3 * * *',
  $$ DELETE FROM public.active_sessions WHERE last_seen < now() - interval '7 days'; $$
);

DELETE FROM public.active_sessions WHERE last_seen < now() - interval '7 days';
