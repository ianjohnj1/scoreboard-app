# Plan: Fix Match Creation and Robust Stat Initialization

This plan addresses the "Failed to create match" error observed in the New Match flow and ensures that player statistics are initialized correctly for all participants, preventing leaderboard inconsistencies.

## Current State Analysis
- **Match Creation Error**: Users encounter a generic "Failed to create match" error when clicking "Start Match" in [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx).
- **Potential Causes**:
    - **RLS/Permissions**: Anonymous role might be missing permissions for specific tables (e.g., `cricket_innings`).
    - **Data Integrity**: The `house_rules` JSON object contains an `undefined` value for the `holes` key when creating a Cricket match, which can cause Supabase insert failures.
    - **Missing Defaults**: Some tables (like `match_players` or `cricket_innings`) might not have database-level defaults for primary key `id` fields.
- **Stat Tracking**: The [stats.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/stats.ts) logic (specifically at line 123) correctly initializes player maps with 0, but we need to ensure this pattern is robustly applied across all game variants (Cricket, Classic Golf, Chip Off).

## Proposed Changes

### 1. Fix Match Creation Logic ([NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx))
- **Sanitize Payload**: Change the `holes` field in `house_rules` from `undefined` to `null` for non-golf matches.
- **Detailed Error Reporting**: Update the `catch` block to display the specific error message from Supabase. This is critical for diagnosing if the failure is due to a unique constraint (e.g., `room_code`), RLS, or a missing column.
- **Explicit ID Generation**: Ensure all records being inserted (`match_players`, `cricket_innings`) have client-generated UUIDs to avoid failures on tables without `DEFAULT gen_random_uuid()` set.

### 2. Robust Stat Initialization ([stats.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/stats.ts))
- **Cricket Path**: Refactor the Cricket stat aggregation to initialize the `playerMap` with all `players` before processing `cricket_player_stats` or `match_events`. Currently, it skips players who have no stats recorded yet.
- **Unified Pattern**: Ensure the "Initialize map with all players at 0" pattern used in Chip Off (line 123) is applied to Classic Golf as well.

### 3. Database RLS Verification
- Provide a summary of required SQL policies to ensure the `anon` role can perform the necessary inserts for the new `cricket_innings` and `cricket_player_stats` tables.

## Verification Plan
- **Manual Testing**:
    - Attempt to create a "Backyard Cricket" match with the fix in place.
    - If it fails, observe the new detailed error message.
    - Complete a match with 0-score players and verify they appear on the leaderboard with 0 runs/points instead of being missing.
- **Console Check**: Monitor the browser console for any 42501 (RLS) or 409 (Conflict/Unique) errors during the creation flow.
