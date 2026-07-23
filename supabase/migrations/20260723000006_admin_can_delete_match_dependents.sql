-- Fix match deletion, part 2: the "Delete Match" button on the Dashboard is
-- admin-only (canDelete={isAdmin} in src/pages/Dashboard.tsx), but most of the
-- tables deleteMatch() (src/lib/matches.ts) touches only grant delete rights
-- to the match host (is_match_host) or an active scorer (can_score_match) -
-- never is_admin_session(). match_rooms, comments, and (after the previous
-- migration) match_events already include the admin fallback; these did not.
--
-- Verified directly against the live schema (via `supabase db query --linked`
-- from a clean worktree, since local migration history is drifted from
-- remote - see 20260723_fix_match_events_delete_rls.sql):
--   - Every FK from these tables to match_rooms is already ON DELETE CASCADE,
--     so once match_rooms is deletable the cascade does the actual cleanup.
--   - But a cascade delete is still filtered by the child table's own RLS for
--     the calling role, so a missing admin-inclusive DELETE policy here blocks
--     the whole match_rooms delete with a foreign key violation, exactly like
--     the match_events gap did.
--   - active_sessions is the sharpest case: its only DELETE policy is
--     "id = caller's own session", so any OTHER user's session still pointed
--     at the match (MatchRoomPage sets active_sessions.match_id while a room
--     is open) blocks the cascade even for the match's own host.
--
-- These are additive DELETE-only policies (mirroring how the match_events fix
-- was done) so existing host/scorer policies for INSERT/UPDATE are untouched.

CREATE POLICY "Admin can delete cricket_innings"
ON cricket_innings FOR DELETE USING (is_admin_session());

CREATE POLICY "Admin can delete cricket_player_stats"
ON cricket_player_stats FOR DELETE USING (is_admin_session());

CREATE POLICY "Admin can delete golf_scores"
ON golf_scores FOR DELETE USING (is_admin_session());

CREATE POLICY "Admin can delete golf_holes"
ON golf_holes FOR DELETE USING (is_admin_session());

CREATE POLICY "Admin can delete match_players"
ON match_players FOR DELETE USING (is_admin_session());

CREATE POLICY "Admin can delete match_teams"
ON match_teams FOR DELETE USING (is_admin_session());

CREATE POLICY "Admin can delete any active_sessions row"
ON active_sessions FOR DELETE USING (is_admin_session());

SELECT pg_notify('pgrst', 'reload schema');
