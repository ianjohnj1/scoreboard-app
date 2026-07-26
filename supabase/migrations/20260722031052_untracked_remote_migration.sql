-- This version's content was recovered on 2026-07-26 while auditing the ten
-- legacy no-timestamp migration files: a stray local file named
-- `reload_pgrst_schema.sql` (deleted, see git history) had this exact SQL,
-- and the remote schema_migrations row for this version has `name =
-- 'reload_pgrst_schema.sql'` verbatim - unstripped of its .sql extension,
-- matching Bolt.new's apply pattern rather than this repo's own convention
-- of stripping it. That match is strong enough to treat this as the real
-- historical content rather than a guess. It's a one-time cache-bust notify
-- with no lasting schema effect, so replaying it (or not) changes nothing.
select pg_notify('pgrst', 'reload schema');
