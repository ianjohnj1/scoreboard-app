# Tasks
- [x] Task 1: Audit and enhance `src/lib/stats.ts` aggregation.
  - [x] Ensure `aggregateMatchStats` correctly maps all event types from `match_events` for each sport.
  - [x] Add a fallback mechanism for Cricket to ensure `match_events` data is considered if `cricket_player_stats` is missing or out of sync.
- [x] Task 2: Refactor `LeaderboardPage.tsx` for data consistency and scaling.
  - [x] Update "All Sports" view to aggregate by `profile_id` instead of displaying separate rows per sport.
  - [x] Ensure sport-specific sorting is handled correctly for mixed sports (e.g., using a normalized "rank_score").
- [x] Task 3: Verify and harden the match completion trigger.
  - [x] Ensure `updateMatchStatus` in `src/lib/matches.ts` reliably awaits the career stat update.
  - [x] Add error logging and retry logic for the aggregation process.
- [x] Task 4: Validate real-time updates.
  - [x] Verify that the `postgres_changes` subscription in `LeaderboardPage.tsx` correctly triggers a refresh when career stats are updated.

# Task Dependencies
- Task 2 depends on Task 1.
- Task 4 depends on Task 3.
