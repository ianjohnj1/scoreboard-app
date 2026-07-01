# Plan: Fix Connectivity Errors and Sync Leaderboard to Event Data

The goal is to resolve the recurring `net::ERR_ABORTED` errors in the game rooms and ensure the leaderboard reflects the true "Source of Truth" by aggregating directly from `match_events`.

## Current State Analysis
1.  **Connectivity Errors**: The `net::ERR_ABORTED` error in `ChipOffRoom` occurs when `loadData` is triggered by a database change while a previous fetch is still in flight or when the component re-renders. This is especially prevalent on the "first click" of a round due to state transitions.
2.  **Leaderboard Sync**: The `LeaderboardPage` currently queries the `player_career_stats` table. While this table is updated on match completion, the user wants the leaderboard to be "hooked up to match event data" to ensure accuracy and consistency with the raw logs.
3.  **Stats Logic**: The `getGlobalLeaderboardData` function in `stats.ts` is missing the "Season Points" (SP) calculation logic, making it insufficient for the Global MVP view.

## Proposed Changes

### 1. Enhance Stats Engine (`src/lib/stats.ts`)
- Update `getGlobalLeaderboardData` to:
    - Calculate placement-based Season Points (1st: 100, 2nd: 50, 3rd: 25, others: 10) for every completed match.
    - Calculate milestone-based Season Points (Hole-In-Ones, Cricket runs/wickets).
    - Return a comprehensive set of metrics including `season_points`, `cricket_lifetime_runs`, `golf_lifetime_points`, etc.

### 2. Refactor Leaderboard (`src/pages/LeaderboardPage.tsx`)
- Replace the direct Supabase query with a call to `getGlobalLeaderboardData()`.
- Update the filtering and sorting logic to use the new aggregated data structure.
- Add a subscription to `match_rooms` (status changes) to trigger a refresh when any match is finalized.

### 3. Stability Fixes for Game Rooms
- **`src/components/sports/ChipOffRoom.tsx`**, **`src/components/sports/CricketRoom.tsx`**, **`src/components/sports/GolfRoom.tsx`**:
    - Add an `AbortController` to the `loadData` function to safely cancel stale network requests.
    - Implement a 200ms debounce on the Realtime `postgres_changes` listener to prevent "request storms" during rapid scoring.
    - Refine the `loading` state logic to prevent the UI from flickering or blocking during background syncs.

## Verification Steps
1.  **Test Scoring**: Open "Chip Off" and perform multiple scoring actions. Verify that `net::ERR_ABORTED` no longer appears in the console and that scores are updated instantly.
2.  **Verify Leaderboard**: Complete a match and navigate to the Leaderboard. Verify that the stats (Runs, Points, SP) match the events of the completed game.
3.  **Global MVP Check**: Verify that the Global MVP view correctly sums up points across different sports for the same player.
