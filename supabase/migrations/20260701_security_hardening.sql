-- Security Hardening Migration
-- 1. Enable RLS on core tables that were missing it
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_rooms ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- Allow guest profile creation (needed for Backyard mode)
DROP POLICY IF EXISTS "Allow guest profile creation" ON profiles;
CREATE POLICY "Allow guest profile creation" ON profiles FOR INSERT 
WITH CHECK (is_guest = true);

-- 3. Match Rooms Policies
DROP POLICY IF EXISTS "Public matches are viewable by everyone" ON match_rooms;
CREATE POLICY "Public matches are viewable by everyone" ON match_rooms FOR SELECT USING (true);

-- Anyone can create a match
DROP POLICY IF EXISTS "Anyone can create a match" ON match_rooms;
CREATE POLICY "Anyone can create a match" ON match_rooms FOR INSERT WITH CHECK (true);

-- Only the creator can update or delete a match
DROP POLICY IF EXISTS "Creators can update their matches" ON match_rooms;
CREATE POLICY "Creators can update their matches" ON match_rooms FOR UPDATE 
USING (auth.uid() = created_by OR created_by IS NULL)
WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

DROP POLICY IF EXISTS "Creators can delete their matches" ON match_rooms;
CREATE POLICY "Creators can delete their matches" ON match_rooms FOR DELETE
USING (auth.uid() = created_by OR created_by IS NULL);

-- 4. Tighten Game-Related Tables (match_events, cricket_innings, etc.)
-- These tables should only be modifiable by the match creator

-- Match Players
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access on match_players" ON match_players;
CREATE POLICY "Allow public access on match_players" ON match_players FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only match host can modify players" ON match_players;
CREATE POLICY "Only match host can modify players" ON match_players FOR ALL 
USING (EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id 
    AND (created_by = auth.uid() OR created_by IS NULL)
));

-- Match Teams
ALTER TABLE match_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access on match_teams" ON match_teams;
CREATE POLICY "Allow public access on match_teams" ON match_teams FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only match host can modify teams" ON match_teams;
CREATE POLICY "Only match host can modify teams" ON match_teams FOR ALL 
USING (EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id 
    AND (created_by = auth.uid() OR created_by IS NULL)
));

-- Match Events
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access on match_events" ON match_events;
CREATE POLICY "Allow public access on match_events" ON match_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only match host can insert events" ON match_events;
CREATE POLICY "Only match host can insert events" ON match_events FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id 
    AND (created_by = auth.uid() OR created_by IS NULL)
));
DROP POLICY IF EXISTS "Only match host can update events" ON match_events;
CREATE POLICY "Only match host can update events" ON match_events FOR UPDATE 
USING (EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id 
    AND (created_by = auth.uid() OR created_by IS NULL)
));

-- Cricket Innings
ALTER TABLE cricket_innings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access on cricket_innings" ON cricket_innings;
CREATE POLICY "Allow public access on cricket_innings" ON cricket_innings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only match host can modify innings" ON cricket_innings;
CREATE POLICY "Only match host can modify innings" ON cricket_innings FOR ALL 
USING (EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id 
    AND (created_by = auth.uid() OR created_by IS NULL)
));

-- Cricket Player Stats
ALTER TABLE cricket_player_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access on cricket_player_stats" ON cricket_player_stats;
CREATE POLICY "Allow public access on cricket_player_stats" ON cricket_player_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only match host can modify player stats" ON cricket_player_stats;
CREATE POLICY "Only match host can modify player stats" ON cricket_player_stats FOR ALL 
USING (EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id 
    AND (created_by = auth.uid() OR created_by IS NULL)
));

-- Golf Scores
ALTER TABLE golf_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access on golf_scores" ON golf_scores;
CREATE POLICY "Public access on golf_scores" ON golf_scores FOR SELECT USING (true);
DROP POLICY IF EXISTS "Only match host can modify golf scores" ON golf_scores;
CREATE POLICY "Only match host can modify golf scores" ON golf_scores FOR ALL 
USING (EXISTS (
    SELECT 1 FROM match_rooms 
    WHERE id = match_id 
    AND (created_by = auth.uid() OR created_by IS NULL)
));

-- 5. Storage Hardening (Avatars)
-- Remove anonymous upload access, enforce UID-to-folder mapping
DROP POLICY IF EXISTS "Allow individual uploads" ON storage.objects;
CREATE POLICY "Allow individual uploads" ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (LOWER(storage.extension(name)) = ANY (ARRAY['jpg', 'jpeg', 'png', 'webp']))
);

DROP POLICY IF EXISTS "Allow individual updates" ON storage.objects;
CREATE POLICY "Allow individual updates" ON storage.objects FOR UPDATE 
USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT 
USING ( bucket_id = 'avatars' );
