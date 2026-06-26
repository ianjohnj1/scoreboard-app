# Plan: Fix active_sessions Database Disconnect

The `active_sessions` table in Supabase was appearing empty for some users because the application was not correctly initializing sessions for returning users who were "remembered" via `localStorage`. Additionally, missing RLS policies on the table may have prevented data from being written.

## Current State Analysis

- **AuthContext.tsx**: Only creates a session during the initial `login()` call. If a user returns and is loaded from `localStorage`, no session row is created or verified in Supabase.
- **MatchRoomPage.tsx**: Correctly tries to update the session with `match_id`, but fails if `sessionId` is missing.
- **Supabase Schema**: The `active_sessions` table exists, but RLS was enabled without any public policies, potentially blocking `INSERT` and `UPDATE` operations for anonymous users.

## Proposed Changes

### 1. `src/contexts/AuthContext.tsx`
- Update the initialization `useEffect` to not only load from `localStorage` but also verify/upsert a row in the `active_sessions` table for the current user.
- This ensures that every time the app starts, the user has a valid session record in the database.

### 2. Database Migration (`supabase/migrations/fix_active_sessions_rls.sql`)
- Add RLS policies to `active_sessions` to allow:
    - `SELECT`: Public access (for presence features).
    - `INSERT`: Public access (to create new sessions).
    - `UPDATE`: Public access (to update `last_seen` and `match_id`).
    - `DELETE`: Public access (to clean up sessions on logout).

## Verification Steps

1. **Session Creation**: Verify that a new row is created in the `active_sessions` table when logging in or refreshing the page as a logged-in user.
2. **Match Linking**: Verify that navigating to a match room updates the `match_id` column in the database.
3. **Heartbeat**: Verify that the `last_seen` timestamp updates periodically (every 30 seconds).
4. **Spectator Mode**: Ensure spectator view still works (spectators are currently not tracked in sessions as they are anonymous).
