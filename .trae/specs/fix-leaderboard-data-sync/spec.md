# Leaderboard Data Sync & Database Hookup Spec

## Why
There is a reported disconnect between the raw match events recorded in Supabase (`match_events`) and the aggregated career stats shown on the app's leaderboard. The current implementation relies on an intermediate `player_career_stats` table that is only updated upon match completion, which can lead to stale data if aggregation fails or is not triggered. Additionally, the current leaderboard logic has scaling and accuracy issues, such as duplicate users in the "All Sports" view and inefficient in-memory sorting.

## What Changes
- **Unified Aggregation Source**: Update the stat aggregation logic to prioritize `match_events` as the source of truth for all sports where possible, ensuring consistency with the "match events database".
- **Robust Sync Trigger**: Ensure that `updateCareerStats` is reliably called and handled during match finalization.
- **Enhanced Leaderboard Fetching**: Refactor `LeaderboardPage.tsx` to handle "All Sports" view correctly by aggregating per user, and optimize sorting.
- **Improved Data Integrity**: Add explicit error logging and potentially a "Sync" mechanism to re-calculate career stats from raw events if discrepancies are detected.

## Impact
- Affected code: `src/lib/stats.ts`, `src/pages/LeaderboardPage.tsx`, `src/lib/matches.ts`.
- Database: `player_career_stats`, `match_events`.

## ADDED Requirements
### Requirement: User-Centric Global Leaderboard
The "All Sports" view SHALL aggregate a user's performance across all sports into a single entry, rather than showing them multiple times for different sports.

#### Scenario: Global Ranking
- **WHEN** a user plays multiple sports (e.g., Golf and Cricket)
- **THEN** the "All Sports" leaderboard shows them once with aggregated wins and total GP.

## MODIFIED Requirements
### Requirement: Stat Aggregation
The system SHALL aggregate stats from `match_events` for all sports that support point-based or event-based scoring (Cricket, Golf Chip Off, Darts, etc.) to ensure the leaderboard is "hooked up" to the primary event database.

## REMOVED Requirements
None.
