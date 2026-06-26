# Plan: Hook up Leaderboard to Match Events Database

## Summary
The user reports that the leaderboard is currently blank because it fetches from an empty `player_career_stats` table. The goal is to refactor the leaderboard to fetch data directly from the `match_events` and `match_rooms` tables, which contain the live scoring data. This will ensure the leaderboard is always accurate and "hooked up" to the primary source of truth.

## Current State Analysis
- `LeaderboardPage.tsx` fetches from `player_career_stats`.
- `player_career_stats` is an aggregation table that is only populated when a match is completed via `updateCareerStats`.
- If no matches have been completed or the sync failed, the leaderboard is empty.
- Raw score data exists in `match_events`, `golf_scores`, `cricket_player_stats`, etc.

## Proposed Changes

### 1. Refactor Stat Aggregation Logic (`src/lib/stats.ts`)
- Implement a new function `getGlobalLeaderboardData()` that:
    - Fetches all `completed` matches from `match_rooms`.
    - Fetches all associated `match_players` and their `profiles`.
    - Fetches all `match_events` for those matches.
    - Aggregates the data in the frontend using the existing `aggregateMatchStats` logic but scaled for all matches.
- This function will return an array of `LeaderboardEntry` objects.

### 2. Update Leaderboard Page (`src/pages/LeaderboardPage.tsx`)
- Replace the direct Supabase query to `player_career_stats` with a call to the new `getGlobalLeaderboardData()` function.
- Update the `useEffect` and `refreshKey` logic to trigger this new fetch.
- Ensure the "All Sports" and sport-specific filters still work by filtering the aggregated data.
- (Optional) Keep the real-time listener but point it to `match_rooms` or `match_events` to trigger a refresh when a game finishes.

### 3. Optimization & Scalability
- Since fetching all events for all matches can be heavy, we will:
    - Only fetch events for `completed` matches.
    - Use `Promise.all` for parallel fetching.
    - Implement basic caching or memoization if needed.

## Assumptions & Decisions
- **Decision**: We will perform the aggregation in the frontend for now to satisfy the user's request for a "hooked up" leaderboard without requiring complex backend changes (like Supabase RPCs) immediately.
- **Assumption**: The number of completed matches and events is currently small enough that frontend aggregation is performant.

## Verification Steps
1. Complete a match in the app.
2. Navigate to the Leaderboard page.
3. Verify that the player's stats appear immediately, even if the `player_career_stats` table is empty.
4. Test different sport filters to ensure they correctly filter the live-aggregated data.
5. Verify that "All Sports" correctly aggregates a user's performance across different game types.
