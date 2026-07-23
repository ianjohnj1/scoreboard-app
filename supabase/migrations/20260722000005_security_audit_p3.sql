-- Priority 3: Admin Actions Enforced Server-Side

-- 1. Helper function to check if current session belongs to an admin
CREATE OR REPLACE FUNCTION is_admin_session()
RETURNS boolean AS $$
DECLARE
  prof_id uuid;
  admin_flag boolean;
BEGIN
  prof_id := get_current_session_profile_id();
  IF prof_id IS NULL THEN RETURN false; END IF;
  
  SELECT is_admin INTO admin_flag FROM profiles WHERE id = prof_id;
  RETURN COALESCE(admin_flag, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update profiles RLS to allow admins to link guest accounts
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile or admins can update guests" ON profiles;

CREATE POLICY "Users can update own profile or admins can update guests" ON profiles FOR UPDATE 
USING (
  get_current_session_profile_id() = id 
  OR (is_admin_session() AND is_guest = true)
) 
WITH CHECK (
  get_current_session_profile_id() = id 
  OR (is_admin_session() AND is_guest = true)
);

-- 3. Update match_rooms RLS to allow admins to delete matches
DROP POLICY IF EXISTS "Only hosts can delete match_rooms" ON match_rooms;

CREATE POLICY "Hosts and admins can delete match_rooms" 
ON match_rooms FOR DELETE 
USING (
  created_by = get_current_session_profile_id()
  OR is_admin_session()
);
