-- Fix match deletion: deleteMatch() (src/lib/matches.ts) deletes match_events
-- before match_rooms because the FK is not ON DELETE CASCADE - children must
-- be cleared first. But 20260723_rls_lockdown_step1.sql dropped the old
-- permissive "Allow public delete on match_events" policy without replacing
-- it, so match_events has had SELECT/INSERT/UPDATE policies but no DELETE
-- policy since. RLS silently filters an unauthorized DELETE to 0 rows (no
-- error raised), so the leftover match_events rows then trip the foreign key
-- constraint when deleteMatch() reaches `DELETE FROM match_rooms`, failing
-- the whole deletion for any match that has at least one recorded event.
-- The Dashboard's "Delete Match" button is admin-only (canDelete={isAdmin}),
-- so this blocked admins too, not just non-host callers.

CREATE POLICY "Host or admin can delete match_events"
ON match_events FOR DELETE
USING (is_match_host(match_id) OR is_admin_session());

SELECT pg_notify('pgrst', 'reload schema');
