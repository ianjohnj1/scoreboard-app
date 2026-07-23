-- Priority 2: Text Sanitization and Rate Limiting

-- 1. Text Sanitization via CHECK constraints
-- Prevent excessively long display names and HTML tag injections
ALTER TABLE profiles
  ADD CONSTRAINT check_display_name_length CHECK (char_length(display_name) <= 50),
  ADD CONSTRAINT check_display_name_no_html CHECK (display_name !~ '<[^>]*>'),
  ADD CONSTRAINT check_catchphrase_length CHECK (catchphrase IS NULL OR char_length(catchphrase) <= 100),
  ADD CONSTRAINT check_catchphrase_no_html CHECK (catchphrase IS NULL OR catchphrase !~ '<[^>]*>');

-- 2. Server-side Rate Limiting for Events
-- Create a table to track insert rates (or we can just query the table itself if performance allows)
-- A simpler approach is to use a trigger to check recent inserts in the same table.

CREATE OR REPLACE FUNCTION rate_limit_check()
RETURNS trigger AS $$
DECLARE
  recent_count int;
  current_prof_id uuid;
BEGIN
  current_prof_id := get_current_session_profile_id();
  
  -- If we don't have a profile ID, we can't rate limit effectively, but let's assume valid session
  IF current_prof_id IS NOT NULL THEN
    -- Check how many events this user created in the last 10 seconds
    SELECT count(*) INTO recent_count
    FROM match_events
    WHERE recorded_by = current_prof_id
      AND created_at > now() - interval '10 seconds';
      
    -- Limit to 50 events per 10 seconds
    IF recent_count >= 50 THEN
      RAISE EXCEPTION 'Rate limit exceeded: too many requests';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rate_limit_match_events ON match_events;
CREATE TRIGGER trg_rate_limit_match_events
BEFORE INSERT ON match_events
FOR EACH ROW
EXECUTE FUNCTION rate_limit_check();
