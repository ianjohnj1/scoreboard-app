# RLS Verification SQL for Cricket Tables

If you are encountering permission errors (42501) during match creation or scoring, please run the following SQL script in your Supabase SQL Editor. This ensures the `anon` role can access the cricket-specific tables required for Backyard and Classic modes.

```sql
-- 1. Enable RLS on Cricket Tables
ALTER TABLE cricket_innings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cricket_player_stats ENABLE ROW LEVEL SECURITY;

-- 2. Grant Permissions to Anonymous Role
-- Cricket Innings (Allow read/insert/update)
CREATE POLICY "Allow public access on cricket_innings" 
ON cricket_innings FOR ALL TO anon 
USING (true) WITH CHECK (true);

-- Cricket Player Stats (Allow read/insert/update)
CREATE POLICY "Allow public access on cricket_player_stats" 
ON cricket_player_stats FOR ALL TO anon 
USING (true) WITH CHECK (true);

-- 3. Ensure cascading deletes (Optional but recommended)
-- This ensures that when a match is deleted, its innings and stats are also removed
ALTER TABLE cricket_innings 
DROP CONSTRAINT IF EXISTS cricket_innings_match_id_fkey,
ADD CONSTRAINT cricket_innings_match_id_fkey 
FOREIGN KEY (match_id) REFERENCES match_rooms(id) ON DELETE CASCADE;

ALTER TABLE cricket_player_stats 
DROP CONSTRAINT IF EXISTS cricket_player_stats_match_id_fkey,
ADD CONSTRAINT cricket_player_stats_match_id_fkey 
FOREIGN KEY (match_id) REFERENCES match_rooms(id) ON DELETE CASCADE;
```
