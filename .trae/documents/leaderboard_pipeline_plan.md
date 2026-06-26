# Plan: Implement Match Leaderboard Pipeline

This plan outlines the creation of a real-time, sport-aware leaderboard component that aggregates player scores for a specific match and integrates into the Match Room UI.

## Summary
- **Goal**: Create a reusable `MatchLeaderboard` component that provides live standings for any match.
- **Key Features**:
    - Sport-specific score aggregation (Cricket runs, Golf strokes, Chip Off points).
    - Real-time updates via Supabase listeners.
    - Tie-breaking logic (e.g., most 10s in Chip Off).
    - Tab-based navigation in the Match Room for easy access.

## Proposed Changes

### 1. Create MatchLeaderboard Component
- **[MatchLeaderboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/MatchLeaderboard.tsx)** (New File)
    - **Props**: `matchId: string`, `sport: string`, `players: MatchPlayer[]`, `profiles: Map<string, Profile>`.
    - **State**: `stats: Map<string, any>`, `loading: boolean`.
    - **Aggregation Engine**:
        - **Cricket**: Fetches from `cricket_player_stats`. Sorts by runs (DESC).
        - **Golf**: Fetches from `golf_scores` and `golf_holes`. Calculates strokes and "to-par". Sorts by total strokes (ASC).
        - **Chip Off**: Fetches from `match_events`. Sums points and counts 10-point shots. Sorts by points (DESC) then 10s (DESC).
        - **Generic**: Derives scores from `match_events` for other sports.
    - **Real-time**: Sets up Supabase subscriptions on `match_events`, `golf_scores`, and `cricket_player_stats` as needed.

### 2. Update MatchRoomPage UI
- **[MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)**
    - Add a `currentTab` state (`'game' | 'leaderboard'`).
    - Implement a sleek tab switcher below the header.
    - Conditionally render either the `SportRoom` or the new `MatchLeaderboard`.

### 3. Refine Sport-Specific Logging (if needed)
- Ensure all sports consistently log events to `match_events` to support the generic leaderboard fallback.

## Assumptions & Decisions
- **Tie-Breakers**: 
    - **Chip Off**: Points > Holes-in-one (10s) > Sequence of achievement.
    - **Cricket**: Runs > Balls faced (lower is better SR).
    - **Golf**: Total strokes > Lowest single hole score (standard countback).
- **Real-time Performance**: Subscriptions will be scoped to the specific `match_id` to minimize client-side processing.

## Verification Steps
1. **Cricket Match**:
    - Log runs for multiple batters.
    - Verify the leaderboard shows batters sorted by runs in real-time.
2. **Golf Match**:
    - Log scores for multiple holes.
    - Verify the leaderboard shows players sorted by total strokes (lowest first).
3. **Chip Off Match**:
    - Log various point values.
    - Verify tie-breaking (most 10s) works when two players have equal total points.
4. **Spectator View**:
    - Ensure the leaderboard works for spectators without editing permissions.
