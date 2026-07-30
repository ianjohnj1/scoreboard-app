-- Admins can End & Lock (or Pause/Resume) any match via the header menu,
-- independent of whether they created or joined it - every sport room's
-- canInteract check already treats ctx.isAdmin as a blanket override
-- (`match.status === 'active' || ctx.isAdmin`). The match_rooms UPDATE
-- policy never got the matching override that the DELETE policy already
-- has ("Hosts and admins can delete match_rooms"), so an admin's End & Lock
-- click on a match they didn't create or play in silently affected 0 rows -
-- PostgREST returns 204 either way, so the client saw no error while the
-- match stayed 'active' forever.
DROP POLICY IF EXISTS "Hosts and participants can update match_rooms" ON match_rooms;

CREATE POLICY "Hosts, participants, and admins can update match_rooms"
ON match_rooms FOR UPDATE
USING (is_match_participant(id) OR is_admin_session())
WITH CHECK (is_match_participant(id) OR is_admin_session());
