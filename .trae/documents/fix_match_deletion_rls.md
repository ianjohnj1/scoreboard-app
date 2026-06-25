# Plan: Fix Match Deletion and RLS Permissions

The match deletion is currently failing likely due to missing **Row-Level Security (RLS)** permissions for the `DELETE` operation in Supabase, and potentially due to **Foreign Key constraints** if related records (teams, players, events) exist.

## Current State Analysis
- **RLS Policy**: The `anon` role (used by the PIN-based auth) has `SELECT`, `INSERT`, and `UPDATE` policies, but likely lacks a `DELETE` policy for `match_rooms`.
- **Foreign Keys**: Deleting a record from `match_rooms` will fail if there are records in `match_teams`, `match_players`, or `match_events` that reference it, unless `ON DELETE CASCADE` is enabled.
- **Frontend Feedback**: The current `handleDeleteMatch` in `Dashboard.tsx` logs errors to the console but doesn't show a clear alert to the user if the database blocks the request.

## Proposed Changes

### 1. Database Fix (Action Required in Supabase SQL Editor)
I will provide a SQL script to grant `DELETE` permissions and ensure cascading deletes are enabled for related tables.

### 2. Robust Deletion Logic
- **File**: `src/lib/matches.ts`
    - Update `deleteMatch` to manually delete related records in `match_events`, `match_players`, and `match_teams` before deleting the `match_room`. This acts as a fallback if cascading deletes aren't configured in the database.

### 3. Improved UI Feedback
- **File**: `src/pages/Dashboard.tsx`
    - Update `handleDeleteMatch` to provide better error alerts so you can see the specific reason for failure (e.g., "Permission Denied").

## Verification Steps
1. **Apply SQL**: Run the provided SQL script in the Supabase SQL Editor.
2. **Test Deletion**: 
    - Create a test match.
    - Click the delete icon on the Dashboard.
    - Confirm that the match is successfully removed and the dashboard refreshes.
3. **Check Console**: Verify that no `42501` (RLS) or `23503` (Foreign Key) errors appear in the browser console.
