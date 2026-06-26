# Plan: Permanent Multi-Sport Career Leaderboard and Global MVP Engine

## Summary
Refactor the leaderboard into a live, historical "Source of Truth" by implementing a permanent aggregation system with "Season Points" (SP) and sport-specific milestones. The UI will be updated to include macro-filters and a podium layout for top performers.

## Current State Analysis
- `player_career_stats` table exists but is currently underutilized as the `LeaderboardPage` bypasses it for live aggregation.
- Match completion trigger `updateCareerStats` exists but lacks SP and milestone logic.
- UI has sport filters but lacks the requested macro-filter navigation and podium layout.

## Proposed Changes

### Phase 1: Database Schema & Migration
1.  **Schema Update**: Update `player_career_stats` table to include:
    - `season_points` (INTEGER, default 0)
    - `cricket_lifetime_runs` (INTEGER, default 0)
    - `cricket_lifetime_wickets` (INTEGER, default 0)
    - `golf_lifetime_points` (INTEGER, default 0)
    - `golf_lifetime_hio` (INTEGER, default 0)
2.  **Migration**: Create a migration script to add these columns and initialize them for existing records if necessary.

### Phase 2: Global MVP & Milestone Processor
1.  **Modify `updateCareerStats`** in `src/lib/stats.ts`:
    - Calculate **Placement Points**:
        - 1st Place: +100 SP
        - 2nd Place: +50 SP
        - 3rd Place: +25 SP
        - Others: +10 SP
    - Calculate **"Feat of Strength" Milestones**:
        - Chip Off: +50 SP per Hole-In-One.
        - Cricket: +50 SP for 50+ runs; +30 SP for 3+ wickets.
    - Update lifetime stats (runs, wickets, etc.) alongside the existing `total_score` and `matches_played`.
2.  **Support Local Guests**: Ensure the logic correctly handles unique string IDs for guest players, preserving their entries in the ledger.

### Phase 3: Single-Screen Adaptive UI
1.  **Refine `LeaderboardPage.tsx`**:
    - **Top Navigation**: Implement a horizontal scrolling pill selector for [🏆 Global MVP], [🏏 Cricket], [⛳ Chip Off], etc.
    - **Default View (Global MVP)**: Sort by `season_points` and display a podium/trophy layout for the top 3.
    - **Sport-Specific Views**: Dynamically switch sorting metrics and labels based on the selection.
    - **Real-time Sync**: Ensure the component listens to `player_career_stats` updates for instant feedback.

## Assumptions & Decisions
- **Decision**: We will continue using the `player_career_stats` table for performance and reliability, but update the completion trigger to keep it perfectly in sync with the requested SP and milestones.
- **Decision**: For placement points in team games, all players on the team receive the points associated with their team's rank.

## Verification Steps
1.  Verify database schema updates via Supabase dashboard or SQL query.
2.  Run a test match (e.g., Chip Off with a Hole-In-One) and verify SP is correctly awarded and persisted.
3.  Check the Leaderboard UI to ensure the new filters and podium layout display correctly.
4.  Confirm that guest players are correctly represented in the standings.
