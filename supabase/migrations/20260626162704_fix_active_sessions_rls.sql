-- Historical migration, recovered 2026-07-26 while reconciling migration
-- history (see docs/rls-ground-rules.md). The USING(true) policies below were
-- later dropped and replaced by session-aware policies in
-- 20260723000001_rls_lockdown_step1.sql - confirmed via live pg_policies
-- that none of these policy names exist today. Kept for historical accuracy;
-- do not treat this as the current active_sessions RLS.

-- Enable RLS on active_sessions
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to see active sessions (for presence features)
CREATE POLICY "Allow public select on active_sessions" 
ON active_sessions FOR SELECT 
TO anon, authenticated 
USING (true);

-- Allow anyone to create/update their own session
-- Note: Since we use a custom PIN auth and not Supabase Auth, 
-- we allow anon users to manage rows but we should ideally tie it to profile_id.
-- For simplicity in this backyard app, we allow all operations for anon.
CREATE POLICY "Allow public insert on active_sessions" 
ON active_sessions FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

CREATE POLICY "Allow public update on active_sessions" 
ON active_sessions FOR UPDATE 
TO anon, authenticated 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete on active_sessions" 
ON active_sessions FOR DELETE 
TO anon, authenticated 
USING (true);
