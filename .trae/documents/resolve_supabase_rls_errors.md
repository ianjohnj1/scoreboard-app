# Plan: Resolve Supabase Row-Level Security (RLS) Errors

I have investigated the `42501` errors occurring during match creation. These errors are "Row-Level Security (RLS) violations," which happen because your Supabase database has RLS enabled but does not yet have the specific policies required to allow your application to insert or read data.

Because your application uses a custom PIN-based authentication system rather than Supabase's built-in Auth, all database requests are made using the `anon` (anonymous) role.

## Current State Analysis
- **Error Code 42501**: Specifically triggered when trying to insert into `match_rooms`, `match_teams`, or `match_players`.
- **Database Schema**: The app uses `match_rooms`, `match_teams`, `match_players`, `match_events`, and `profiles`.
- **Client Implementation**: The code is already optimized to use client-side ID generation (`crypto.randomUUID()`) and table names are consistent (`match_rooms`).

## Proposed Changes

### 1. Apply Database Policies
You need to run a SQL script in your Supabase SQL Editor to grant the necessary permissions to the `anon` role.

#### SQL Script to Run:
```sql
-- 1. Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cricket_innings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cricket_player_stats ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies (Allow anyone to view and create/update profiles for the PIN system)
CREATE POLICY "Allow public read on profiles" ON profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert on profiles" ON profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update on profiles" ON profiles FOR UPDATE TO anon USING (true);

-- 3. Match Rooms Policies
CREATE POLICY "Allow public read on match_rooms" ON match_rooms FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert on match_rooms" ON match_rooms FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update on match_rooms" ON match_rooms FOR UPDATE TO anon USING (true);

-- 4. Match Teams & Players Policies
CREATE POLICY "Allow public access on match_teams" ON match_teams FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access on match_players" ON match_players FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Match Events & Scoring Policies
CREATE POLICY "Allow public access on match_events" ON match_events FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access on cricket_innings" ON cricket_innings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access on cricket_player_stats" ON cricket_player_stats FOR ALL TO anon USING (true) WITH CHECK (true);
```

### 2. Verification Steps
After running the SQL script:
1. **Test Match Creation**: Go to the "New Match" page and try to create a Backyard Cricket match again.
2. **Check Real-time Updates**: Ensure that scoring an event (like a run or a wicket) updates the UI immediately, verifying that the `match_events` policies are working.
3. **Verify Dashboard**: Check if the "Live Activity" feed on the dashboard correctly displays active matches.

## Assumptions & Decisions
- **Security Trade-off**: These policies allow the `anon` role full access to these tables. This is necessary for your current PIN-based auth flow to work without Supabase Auth. For production, I recommend eventually migrating to Supabase Auth for better security.
- **Table Names**: I have used the verified table names (`match_rooms` instead of `matches`) found in your codebase.
