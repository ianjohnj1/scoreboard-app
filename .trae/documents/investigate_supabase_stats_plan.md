# Plan: Investigate and Optimize Supabase Stat Tracking & Leaderboard

This plan outlines the steps to ensure that all sports are correctly tracked in the database and that the leaderboard displays this data accurately and in real-time.

## Summary
- **Goal**: Ensure comprehensive stat tracking for all sports and a real-time global leaderboard.
- **Key Features**:
    - Unified aggregation pipeline for all supported sports.
    - Real-time leaderboard updates using Supabase subscriptions.
    - Verified database connectivity between match events and career stats.

## Proposed Changes

### 1. Investigation & Audit
- **Files to Review**: [DartsRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/DartsRoom.tsx), [TableTennisRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/TableTennisRoom.tsx), [PoolRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PoolRoom.tsx), [BasketballRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/BasketballRoom.tsx), [CardsRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CardsRoom.tsx), [CustomRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CustomRoom.tsx).
- **Task**: Identify all `event_type` values and the structure of `event_data` for each sport to ensure they are captured by the aggregation logic.

### 2. Update Stats Aggregation Logic
- **[stats.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/stats.ts)**
    - Modify `aggregateMatchStats` to explicitly handle the following event types:
        - `darts_turn`, `darts_win` (summing dart values or counting wins).
        - `tt_point`, `tt_set` (summing points).
        - `pool_frame` (summing frames).
        - `bball_score` (summing points).
        - `cards_round` (summing round scores per player).
        - `custom_score` (summing custom values).
    - Ensure all aggregated data is correctly mapped to the `extra_stats` field in `player_career_stats`.

### 3. Real-time Leaderboard Implementation
- **[LeaderboardPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/LeaderboardPage.tsx)**
    - Add a `useEffect` hook to set up a Supabase Realtime subscription on the `player_career_stats` table.
    - Trigger a data re-fetch or local state update whenever an `INSERT` or `UPDATE` event is received, ensuring the standings stay live as matches conclude.

### 4. Database Schema & RLS Verification
- Verify that the `player_career_stats` table has the necessary columns and that RLS policies (as seen in `update_career_stats_rls.sql`) allow for seamless updates from the client.

## Assumptions & Decisions
- **Decision**: We will continue using `match_events` as the source of truth for "Chip Off" and other event-driven modes, while relying on specialized tables for Cricket and Classic Golf.
- **Assumption**: All matches will eventually call `updateMatchStatus(matchId, 'completed')`, which is the trigger for career stat aggregation.

### 5. Network & Lifecycle Optimization
- **Goal**: Resolve `net::ERR_ABORTED` errors and redundant fetches.
- **Actions**:
    - **Remove Redundant Listeners**: Removed `match_events` listeners from `MatchRoomPage.tsx` and `SpectatorPage.tsx`. These pages only need to listen for `match_rooms` status updates.
    - **Implement AbortController**: Added `AbortController` support to `loadData` and `loadInnings` in sport-specific rooms ([ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx), [GolfRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/GolfRoom.tsx), [CricketRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CricketRoom.tsx)).
    - **Handle Aborted Requests**: Updated data loading logic to silently ignore requests cancelled by component unmounting.
    - **Explicit RLS Policy**: Created [fix_match_events_rls.sql](file:///c:/Users/User/Desktop/scoreboard%20app/project/supabase/migrations/fix_match_events_rls.sql) to ensure `match_events` has public `SELECT` access for the `anon` role.

## Verification Steps
1. **Network Audit**: Open browser developer tools and verify that `match_events` requests are no longer firing redundantly from parent pages.
2. **Lifecycle Test**: Navigate rapidly between match rooms and the dashboard to ensure `AbortController` correctly cancels in-flight requests without causing UI errors.
3. **Chip Off Live Test**: Score points in a Chip Off match and verify that only the `ChipOffRoom` refreshes its event list, while the parent `MatchRoomPage` remains stable.
