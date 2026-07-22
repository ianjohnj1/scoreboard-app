# Leaderboard Data Sync & Database Hookup Spec

## Why
There is a reported disconnect between completed-match data in Supabase and the aggregated stats shown across leaderboard and profile surfaces. The current implementation is not a single-source pipeline: `LeaderboardPage.tsx` rebuilds leaderboard entries through `getGlobalLeaderboardData()` using a mixed-source aggregation of `match_rooms`, `match_players`, `profiles`, `match_events`, and `cricket_player_stats`, while `updateCareerStats()` separately writes persisted `player_career_stats` rows on match completion. If either path misses data or interprets it differently, users can see stale or inconsistent results between the leaderboard, profile stats, and the underlying completed-match records. Additionally, the leaderboard logic has scaling and accuracy issues, such as duplicate users in the "All Sports" view and inefficient in-memory sorting.

## What Changes
- **Accurate Source Mapping**: Update the spec and implementation notes to reflect the current mixed-source aggregation model instead of describing the leaderboard as a pure `match_events` reader or a pure `player_career_stats` reader.
- **Robust Sync Trigger**: Ensure that `updateCareerStats` is reliably called and handled during match finalization so persisted career stats stay aligned with the leaderboard's completed-match view.
- **Enhanced Leaderboard Fetching**: Refactor `LeaderboardPage.tsx` to handle "All Sports" view correctly by aggregating per user, and optimize sorting.
- **Improved Data Integrity**: Add explicit error logging and potentially a resync mechanism that can reconcile leaderboard-facing aggregation with persisted `player_career_stats` when discrepancies are detected.

## Impact
- Affected code: `src/lib/stats.ts`, `src/pages/LeaderboardPage.tsx`, `src/lib/matches.ts`.
- Database: `match_rooms`, `match_players`, `profiles`, `match_events`, `cricket_player_stats`, `player_career_stats`.

## ADDED Requirements
### Requirement: User-Centric Global Leaderboard
The "All Sports" view SHALL aggregate a user's performance across all sports into a single entry, rather than showing them multiple times for different sports.

#### Scenario: Global Ranking
- **WHEN** a user plays multiple sports (e.g., Golf and Cricket)
- **THEN** the "All Sports" leaderboard shows them once with aggregated wins and total GP.

## MODIFIED Requirements
### Requirement: Stat Aggregation
The system SHALL document and maintain leaderboard/stat aggregation in line with the live mixed-source pipeline: leaderboard data is rebuilt from completed matches plus supporting tables (`match_rooms`, `match_players`, `profiles`, `match_events`, and `cricket_player_stats`), while `player_career_stats` remains the persisted career-summary table updated during match completion.

## REMOVED Requirements
None.
