# Plan: Implement Global Leaderboard & Stats Pipeline

This plan outlines the implementation of a comprehensive stats aggregation system that populates the "Leaders" tab with detailed, sport-specific rankings.

## Summary
- **Goal**: Transition the current global leaderboard from a simple win-loss list to a detailed, filterable, and sortable ranking system across all sports.
- **Key Features**:
    - Automatic career stat updates upon match completion.
    - Sport-specific metrics (e.g., Cricket runs/wickets, Golf strokes, Chip Off points).
    - Enhanced "Leaders" page with multi-metric sorting and comparisons.
    - Real-time aggregation pipeline using Supabase and a new stats utility.

## Proposed Changes

### 1. Stats Utility & Integration
- **[stats.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/stats.ts)** (New File)
    - `aggregateMatchStats(matchId, sport)`: Logic to sum up performance for a single match.
        - **Cricket**: Sums runs, balls, wickets, etc., from `cricket_player_stats`.
        - **Golf**: Calculates total strokes and to-par from `golf_scores`.
        - **Chip Off**: Aggregates points and 10-pointers from `match_events`.
    - `updateCareerStats(matchId)`: Fetches match data and updates the `player_career_stats` table for all participants.
- **[matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts)**
    - Modify `updateMatchStatus` to trigger `updateCareerStats` whenever a match is set to `completed`.

### 2. Enhanced Leaderboard Page
- **[LeaderboardPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/LeaderboardPage.tsx)**
    - **Dynamic Metrics**: Update the UI to display different stats based on the selected sport filter:
        - **Cricket**: Show "Runs" and "Wickets".
        - **Golf**: Show "Avg Strokes" and "Holes-in-One".
        - **Chip Off**: Show "Total Points" and "10s".
    - **Sorting Logic**:
        - **Chip Off**: Primary: Points (DESC), Secondary: 10s (DESC).
        - **Golf**: Primary: Avg Strokes (ASC).
        - **Cricket**: Primary: Runs (DESC).
    - **Visual Comparison**: Refine the list item design to clearly show multiple stats for easy comparison between players.

### 3. Database Schema Alignment
- Ensure `player_career_stats.extra_stats` (JSONB) is consistently used to store these sport-specific aggregates.
- Add or verify RLS policies to allow the `anon` role (authenticated via PIN) to update these stats when a match ends.

## Assumptions & Decisions
- **Manual Backfill**: Only new matches marked as `completed` after this update will contribute to the career stats. A manual backfill for old matches is out of scope for this plan but can be triggered later if needed.
- **Tie-Breakers**: As defined in the aggregation logic, we will use secondary metrics (like 10s for Chip Off) to break ties in the display.

## Verification Steps
1. **Match Completion**:
    - Complete a Cricket match and verify that the `player_career_stats` table for participants is updated with their new runs and wickets.
2. **Global Leaderboard Filtering**:
    - Open the "Leaders" tab and filter by "Golf".
    - Verify the list shows "Avg Strokes" and sorts correctly (lowest first).
3. **Multi-Sport Comparison**:
    - Switch between "Cricket" and "Chip Off" filters.
    - Verify the column headers and data values change to reflect the appropriate sport metrics.
