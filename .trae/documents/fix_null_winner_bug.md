# Plan: Fix Invalid Winner Attribution (The `null === null` Bug)

## Summary
Investigate and resolve a bug in `src/lib/stats.ts` that falsely attributes wins to every player in an individual match. The bug stems from the logic `match.winner_team_id === p.team_id` evaluating to `true` when both variables are `null` or `undefined`. We will update all occurrences of this comparison to explicitly ensure a valid team ID exists before granting a win.

## Current State Analysis
1. **The Bug**: In `getGlobalLeaderboardData` and `calculateMatchStats`, the application determines if a player won a match using:
   ```typescript
   is_winner: match.winner_profile_id === p.profile_id || match.winner_team_id === p.team_id
   ```
2. **The Cause**: For individual matches (like Golf, Chip Off, Darts, Backyard Cricket), players do not belong to teams, and there is no winning team. Therefore, `match.winner_team_id` is `null` and `p.team_id` is `null`. In JavaScript, `null === null` is `true`.
3. **The Effect**: The expression evaluates to `true` for *every* player in an individual match. Every participant incorrectly receives a win, incrementing `matches_won` on the leaderboard and giving them 100 placement points instead of their actual placement points.

## Proposed Changes

### 1. `src/lib/stats.ts`
- **What**: Safely guard the team winner comparison across all instances in the file.
- **How**: Replace the vulnerable `===` check with a strict check that ensures `team_id` is truthy before comparing.
  
  **Location 1**: Inside `calculateMatchStats` (Cricket case, ~Line 130)
  *Old*: `is_winner: calculatedWinnerProfileId === p.profile_id || calculatedWinnerTeamId === p.team_id,`
  *New*: `is_winner: calculatedWinnerProfileId === p.profile_id || (!!p.team_id && calculatedWinnerTeamId === p.team_id),`

  **Location 2**: Inside `calculateMatchStats` (Default case, ~Line 421)
  *Old*: `is_winner: match.winner_profile_id === p.profile_id || match.winner_team_id === p.team_id,`
  *New*: `is_winner: match.winner_profile_id === p.profile_id || (!!p.team_id && match.winner_team_id === p.team_id),`

  **Location 3**: Inside `getGlobalLeaderboardData` (~Line 777)
  *Old*: `const isWinner = match.winner_profile_id === p.profile_id || match.winner_team_id === p.team_id;`
  *New*: `const isWinner = match.winner_profile_id === p.profile_id || (!!p.team_id && match.winner_team_id === p.team_id);`

## Assumptions & Decisions
- **Decision**: Because `getGlobalLeaderboardData()` dynamically aggregates all `match_rooms` events from the database on every load, fixing this bug will *retroactively and instantly correct the global leaderboard* for all past matches without needing a database migration.
- **Note**: The `player_career_stats` table will still contain the inflated `matches_won` numbers since those were permanently saved at the end of the matches. However, the global leaderboard does not use `player_career_stats` for wins/losses; it aggregates them live.

## Verification Steps
1. Open the Leaderboard page.
2. Observe the Golf tab and verify that "Baby daddy" (and others) no longer show a 100% win rate or inflated win counts for matches they lost.
3. Verify that players who *did* win a match still receive their 1 win.