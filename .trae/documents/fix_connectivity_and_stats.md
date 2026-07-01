# Fix Supabase Connectivity and Golf Leaderboard Stats Plan

Investigate and resolve the `net::ERR_ABORTED` errors, fix the match creation blockage, and ensure Golf Chip Off stats are correctly recorded and displayed on the leaderboard.

## Why
- A typo in the Supabase URL in `.env` is causing network failures across the app.
- The player selection screen is stuck likely due to failed profile fetches or network errors.
- Golf Chip Off stats are not appearing on the leaderboard, possibly due to a mismatch in sport identifiers or failed match finalization.

## What Changes

### 1. Environment Configuration
- Revert `VITE_SUPABASE_URL` in `.env` to the correct project reference (`henoedqzusmnxtdsyuc`).

### 2. Connectivity & Resilience
- **[AuthContext.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/contexts/AuthContext.tsx)**: Update the connectivity "ping" to use `.select('*', { count: 'exact', head: true })` instead of selecting a non-existent `count` column.
- **[matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts)**: Standardize the event sequence count logic.

### 3. Match Setup Flow
- **[NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)**: Add better error handling and loading feedback if the profile fetch fails, ensuring the user isn't stuck on a blank player list.

### 4. Golf Chip Off Stats & Leaderboard
- **[stats.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/stats.ts)**: Ensure `aggregateMatchStats` and `updateCareerStats` correctly handle the `chip_off` sport identifier and map it to the expected columns in `player_career_stats`.
- **[LeaderboardPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/LeaderboardPage.tsx)**: Verify the sorting and display logic for the `chip_off` variant.

## Impact
- **Affected code**: `.env`, `AuthContext.tsx`, `NewMatchPage.tsx`, `stats.ts`, `LeaderboardPage.tsx`.
- **User Experience**: Restores app connectivity, enables match creation, and ensures accurate historical rankings.

## Verification Steps
1. Verify that the app connects successfully to Supabase without `ERR_NAME_NOT_RESOLVED` or `ERR_ABORTED` logs.
2. Confirm that the player selection list in `NewMatchPage.tsx` populates correctly.
3. Complete a test "Golf - Chip Off" match and verify that the points and "10s" are recorded in the database.
4. Check the Leaderboard page to ensure the test player appears in the "Chip Off" and "Global MVP" views with correct stats.
