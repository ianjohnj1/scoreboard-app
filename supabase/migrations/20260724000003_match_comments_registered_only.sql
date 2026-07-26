-- Scope correction: match comments/cheers are registered-users-only too, same
-- as events. Guests in this app (roster placeholders a host adds via
-- MatchRoomPage's "add guest" flow, profiles.is_guest = true) never have
-- their own device session - they're tracked for stats but don't sign in
-- themselves - so there was never a real anonymous-spectator-comments use
-- case to support. Confirmed by user: drop the guest-join mechanism entirely
-- rather than build a sign-up-to-save-your-stats path for it.

CREATE OR REPLACE FUNCTION can_post_comment(p_context_type text, p_context_id uuid, p_author_player_id uuid)
RETURNS boolean AS $$
  SELECT p_author_player_id = get_current_session_profile_id()
    AND is_registered_session()
    AND (
      (p_context_type = 'match' AND EXISTS (
        SELECT 1 FROM match_rooms
        WHERE id = p_context_id
          AND COALESCE((house_rules->>'comments_enabled')::boolean, true)
      ))
      OR
      (p_context_type = 'event' AND EXISTS (
        SELECT 1 FROM events WHERE id = p_context_id
      ))
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- No longer needed - anonymous/guest visitors can still read the comments
-- feed (SELECT stays public, unchanged) but never post to it.
DROP FUNCTION IF EXISTS rpc_join_as_guest_spectator(text);

SELECT pg_notify('pgrst', 'reload schema');
