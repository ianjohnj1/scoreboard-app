-- Shared foundation for two new features: Upcoming Events, and Live Spectator
-- Comments & Cheers. `comments` is deliberately polymorphic (context_type/
-- context_id) so both features share one table/component instead of two
-- near-duplicates. Follows docs/rls-ground-rules.md throughout: every table
-- gets RLS from creation, every "who did this" column is server-stamped via a
-- guard trigger (never trusted from the client), every SECURITY DEFINER
-- function pins search_path, and every public USING(true) carries a comment.
--
-- Ordering note: LANGUAGE sql functions (unlike plpgsql) are parse-analyzed
-- at CREATE FUNCTION time, so any table they reference must already exist.
-- `events` is therefore created before is_event_creator/can_post_comment,
-- which both reference it.

-- ============================================================================
-- 0. is_registered_session - only depends on profiles, which already exists.
-- True when the caller's session profile is a full (non-guest) account.
-- Events and event comments are registered-users-only; match comments/cheers
-- allow guest profiles (spectators without an account) per the feature specs.
-- ============================================================================

CREATE OR REPLACE FUNCTION is_registered_session()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = get_current_session_profile_id() AND is_guest = false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 1. events
-- ============================================================================

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_datetime timestamptz NOT NULL,
  location text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_events_title_length CHECK (char_length(title) <= 100),
  CONSTRAINT check_events_title_no_html CHECK (title !~ '<[^>]*>'),
  CONSTRAINT check_events_description_length CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT check_events_description_no_html CHECK (description IS NULL OR description !~ '<[^>]*>'),
  CONSTRAINT check_events_location_length CHECK (location IS NULL OR char_length(location) <= 200),
  CONSTRAINT check_events_location_no_html CHECK (location IS NULL OR location !~ '<[^>]*>')
);

CREATE INDEX idx_events_datetime ON events(event_datetime);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_event_creator(target_event_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM events
    WHERE id = target_event_id AND created_by = get_current_session_profile_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION guard_events_protected_columns()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := get_current_session_profile_id(); -- never trust client input
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT is_admin_session() THEN
      RAISE EXCEPTION 'created_by cannot be reassigned';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_events ON events;
CREATE TRIGGER trg_guard_events
BEFORE INSERT OR UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION guard_events_protected_columns();

CREATE POLICY "Public events are readable by everyone"
ON events FOR SELECT USING (true); -- intentional: dashboard card and event detail are shared, friends-and-family visibility

-- Any registered user can create an event - not host/admin-only, per spec
-- (this isn't a privileged action the way match-scoring corrections are).
CREATE POLICY "Registered users can create events"
ON events FOR INSERT
WITH CHECK (created_by = get_current_session_profile_id() AND is_registered_session());

CREATE POLICY "Creator or admin can update events"
ON events FOR UPDATE
USING (created_by = get_current_session_profile_id() OR is_admin_session())
WITH CHECK (created_by = get_current_session_profile_id() OR is_admin_session());

CREATE POLICY "Creator or admin can delete events"
ON events FOR DELETE
USING (created_by = get_current_session_profile_id() OR is_admin_session());

-- ============================================================================
-- 2. comments (polymorphic: context_type 'match' | 'event')
-- ============================================================================

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type text NOT NULL CHECK (context_type IN ('match', 'event')),
  context_id uuid NOT NULL,
  author_player_id uuid NOT NULL REFERENCES profiles(id),
  author_display_name text NOT NULL,
  type text NOT NULL DEFAULT 'comment' CHECK (type IN ('comment', 'cheer')),
  content text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_comments_cheer_match_only CHECK (type = 'comment' OR context_type = 'match'),
  CONSTRAINT check_comments_content_not_blank CHECK (char_length(trim(content)) > 0),
  CONSTRAINT check_comments_content_no_html CHECK (content !~ '<[^>]*>'),
  CONSTRAINT check_comments_content_length CHECK (
    (context_type = 'match' AND char_length(content) <= 100) OR
    (context_type = 'event' AND char_length(content) <= 500)
  )
);

CREATE INDEX idx_comments_context ON comments(context_type, context_id, created_at);
CREATE INDEX idx_comments_author ON comments(author_player_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Whether the caller may post as author_player_id into this context right now.
-- Match: any session (registered or guest) may post if the match hasn't
-- disabled comments via house_rules. Event: registered users only - events
-- aren't tied to a public spectator link, this is coordination among people
-- you already know, not a broadcast.
CREATE OR REPLACE FUNCTION can_post_comment(p_context_type text, p_context_id uuid, p_author_player_id uuid)
RETURNS boolean AS $$
  SELECT p_author_player_id = get_current_session_profile_id()
    AND (
      (p_context_type = 'match' AND EXISTS (
        SELECT 1 FROM match_rooms
        WHERE id = p_context_id
          AND COALESCE((house_rules->>'comments_enabled')::boolean, true)
      ))
      OR
      (p_context_type = 'event' AND is_registered_session() AND EXISTS (
        SELECT 1 FROM events WHERE id = p_context_id
      ))
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION guard_comments()
RETURNS trigger AS $$
DECLARE
  v_recent_count int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.author_player_id := get_current_session_profile_id(); -- never trust client input
    IF NEW.author_player_id IS NULL THEN
      RAISE EXCEPTION 'No active session';
    END IF;

    SELECT display_name INTO NEW.author_display_name
    FROM profiles WHERE id = NEW.author_player_id;

    SELECT count(*) INTO v_recent_count FROM comments
    WHERE author_player_id = NEW.author_player_id
      AND context_type = NEW.context_type AND context_id = NEW.context_id
      AND created_at > now() - interval '3 seconds';
    IF v_recent_count > 0 THEN
      RAISE EXCEPTION 'Rate limit exceeded: please wait before posting again';
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- The only mutation ever allowed post-creation is the moderation flag.
    IF NEW.context_type IS DISTINCT FROM OLD.context_type
       OR NEW.context_id IS DISTINCT FROM OLD.context_id
       OR NEW.author_player_id IS DISTINCT FROM OLD.author_player_id
       OR NEW.author_display_name IS DISTINCT FROM OLD.author_display_name
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.content IS DISTINCT FROM OLD.content
    THEN
      RAISE EXCEPTION 'Only is_hidden can be changed on an existing comment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_comments ON comments;
CREATE TRIGGER trg_guard_comments
BEFORE INSERT OR UPDATE ON comments
FOR EACH ROW EXECUTE FUNCTION guard_comments();

CREATE POLICY "Public comments are readable by everyone"
ON comments FOR SELECT USING (true); -- intentional: spectators without a session need to read the feed

CREATE POLICY "Callers can post comments where allowed"
ON comments FOR INSERT
WITH CHECK (can_post_comment(context_type, context_id, author_player_id));

CREATE POLICY "Match host or event creator can hide comments"
ON comments FOR UPDATE
USING (
  (context_type = 'match' AND is_match_host(context_id))
  OR (context_type = 'event' AND is_event_creator(context_id))
  OR is_admin_session()
)
WITH CHECK (
  (context_type = 'match' AND is_match_host(context_id))
  OR (context_type = 'event' AND is_event_creator(context_id))
  OR is_admin_session()
);

-- Hard delete is otherwise never exposed (moderation is soft-delete via
-- is_hidden above) - this exists only so deleteMatch()/event deletion can
-- purge comments as part of removing the whole parent resource, mirroring
-- how cricket_player_stats etc. are cleaned up in src/lib/matches.ts.
CREATE POLICY "Match host or event creator can delete comments"
ON comments FOR DELETE
USING (
  (context_type = 'match' AND is_match_host(context_id))
  OR (context_type = 'event' AND is_event_creator(context_id))
  OR is_admin_session()
);

-- ============================================================================
-- 3. event_rsvps
-- ============================================================================

CREATE TABLE event_rsvps (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL CHECK (status IN ('going', 'maybe', 'not_going')),
  responded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, player_id)
);

CREATE INDEX idx_event_rsvps_event ON event_rsvps(event_id);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION guard_event_rsvps()
RETURNS trigger AS $$
BEGIN
  NEW.player_id := get_current_session_profile_id(); -- never trust client input
  IF NEW.player_id IS NULL THEN
    RAISE EXCEPTION 'No active session';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    RAISE EXCEPTION 'event_id cannot be changed';
  END IF;
  NEW.responded_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_event_rsvps ON event_rsvps;
CREATE TRIGGER trg_guard_event_rsvps
BEFORE INSERT OR UPDATE ON event_rsvps
FOR EACH ROW EXECUTE FUNCTION guard_event_rsvps();

CREATE POLICY "Public RSVPs are readable by everyone"
ON event_rsvps FOR SELECT USING (true); -- intentional: "who's coming" is the headline feature, must be visible to all attendees

CREATE POLICY "Callers can set their own RSVP"
ON event_rsvps FOR INSERT
WITH CHECK (player_id = get_current_session_profile_id());

CREATE POLICY "Callers can change their own RSVP"
ON event_rsvps FOR UPDATE
USING (player_id = get_current_session_profile_id())
WITH CHECK (player_id = get_current_session_profile_id());

-- Clean up an event's comments when the event itself is removed - comments
-- has no FK to events (it's polymorphic, can't FK to two parent tables).
-- event_rsvps also cascades via its own FK; deleted explicitly here too for
-- a single, self-documenting cleanup path (harmless no-op if already gone).
CREATE OR REPLACE FUNCTION guard_events_cleanup()
RETURNS trigger AS $$
BEGIN
  DELETE FROM comments WHERE context_type = 'event' AND context_id = OLD.id;
  DELETE FROM event_rsvps WHERE event_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_events_cleanup ON events;
CREATE TRIGGER trg_events_cleanup
BEFORE DELETE ON events
FOR EACH ROW EXECUTE FUNCTION guard_events_cleanup();

-- ============================================================================
-- 4. fan_engagement_stats (career-wide, sibling to player_career_analytics -
-- kept separate since it isn't scoped to completed matches only)
-- ============================================================================

DROP VIEW IF EXISTS fan_engagement_stats;
CREATE VIEW fan_engagement_stats AS
SELECT
  p.id AS profile_id,
  COUNT(*) FILTER (WHERE c.type = 'comment') AS total_comments_sent,
  COUNT(*) FILTER (WHERE c.type = 'cheer') AS total_cheers_sent,
  COUNT(*) AS total_engagement
FROM comments c
JOIN profiles p ON p.id = c.author_player_id
WHERE c.context_type = 'match' AND c.is_hidden = false AND p.is_guest = false
GROUP BY p.id;

-- ============================================================================
-- 5. rpc_join_as_guest_spectator - mints a guest profile + session atomically,
-- same shape as rpc_signup (see 20260723_rls_lockdown_step2.sql). Anonymous
-- spectators need an actual session (not just a profiles row) or
-- get_current_session_profile_id() has nothing to resolve for RLS purposes.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_join_as_guest_spectator(p_display_name text)
RETURNS TABLE (
  id uuid, username text, display_name text, is_guest boolean, is_admin boolean,
  avatar_color text, avatar_url text, catchphrase text, linked_profile_id uuid,
  created_at timestamptz, updated_at timestamptz, session_id uuid
) AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_session_id uuid;
  v_colors text[] := ARRAY['#3b82f6','#10b981','#f97316','#ef4444','#8b5cf6','#06b6d4','#f59e0b','#ec4899','#14b8a6','#84cc16'];
  v_name text := trim(p_display_name);
BEGIN
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Display name is required';
  END IF;

  INSERT INTO profiles (display_name, username, is_guest, is_admin, avatar_color)
  VALUES (
    v_name,
    'guest_spectator_' || replace(gen_random_uuid()::text, '-', ''),
    true, false,
    v_colors[1 + floor(random() * array_length(v_colors, 1))]
  )
  RETURNING * INTO v_profile;

  INSERT INTO active_sessions (profile_id, last_seen) VALUES (v_profile.id, now())
  RETURNING active_sessions.id INTO v_session_id;

  RETURN QUERY SELECT
    v_profile.id, v_profile.username, v_profile.display_name, v_profile.is_guest,
    v_profile.is_admin, v_profile.avatar_color, v_profile.avatar_url, v_profile.catchphrase,
    v_profile.linked_profile_id, v_profile.created_at, v_profile.updated_at, v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION rpc_join_as_guest_spectator(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_join_as_guest_spectator(text) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');
