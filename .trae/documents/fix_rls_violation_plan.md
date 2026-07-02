# Fix RLS Violation for Custom PIN-Based Auth

The recent security hardening introduced Row Level Security (RLS) policies that rely on Supabase Auth's `auth.uid()`. However, since this application uses a custom PIN-based authentication system, `auth.uid()` is always `NULL`. This causes a violation when inserting players into a match because the database cannot verify that the current user is the "host" of the match.

## Current State Analysis
- **Auth System**: Custom PIN-based auth storing profiles in `profiles` and sessions in `active_sessions`. `auth.uid()` is unused.
- **RLS Policies**: `match_players`, `match_teams`, `match_events`, etc., use `EXISTS` subqueries that check if `created_by = auth.uid()`.
- **The Bug**: When a logged-in user creates a match, `created_by` is set to their profile UUID. The RLS policy fails because `auth.uid()` (NULL) does not match the profile UUID.

## Proposed Changes

### 1. Database Migration
Create a new migration `20260702_fix_rls_for_custom_auth.sql` to adjust the RLS policies:
- **Relax Modification Policies**: Since we cannot securely verify the user's identity at the database level without Supabase Auth, we will adjust the policies to allow `INSERT`, `UPDATE`, and `DELETE` operations.
- **Maintain Public Read**: Keep the `FOR SELECT USING (true)` policies so leaderboards and spectator views continue to work.
- **Specific Tables to Update**:
    - `match_players`
    - `match_teams`
    - `match_events`
    - `cricket_innings`
    - `cricket_player_stats`
    - `golf_scores`

### 2. Implementation Strategy
Instead of strictly checking `auth.uid()`, we will allow modifications to these match-related tables for now. In a true production environment with external users, switching to Supabase Auth would be required for secure RLS. However, for this project's current architecture, the application logic (frontend) handles the "Host Only" enforcement.

## Verification Steps
1. Apply the new migration to the Supabase database.
2. Log in as a test user.
3. Attempt to create a new match and add players.
4. Verify that the "Start Match" button no longer triggers an RLS violation.
5. Verify that match events (scoring) can be recorded successfully.
