# Plan: Fix Classic Cricket Match Creation

The user reported that the "Start Match" button does nothing for classic cricket matches. This is caused by an invalid database column (`status`) being used during the initialization of the `cricket_innings` record, which triggers a silent failure or an unhandled error in the match creation flow.

## Current State Analysis
- In `NewMatchPage.tsx`, the `handleCreateMatch` function attempts to insert a record into `cricket_innings` with a `status: 'active'` field.
- The `cricket_innings` table schema uses `is_completed: boolean` instead of `status`.
- The classic cricket initialization is missing team assignments (`batting_team_id`, `bowling_team_id`) in the innings record.

## Proposed Changes

### 1. Fix `handleCreateMatch` in `src/pages/NewMatchPage.tsx`
- Refactor the cricket-specific initialization block to:
  - Use the correct column name `is_completed: false`.
  - Pass the generated `team1Id` and `team2Id` to the innings record for classic matches.
  - Automatically set the first two players from the batting team as `current_batter1_id` and `current_batter2_id`.
  - Automatically set the first player from the bowling team as `current_bowler_id`.
  - Add initialization for Backyard mode as well to ensure a consistent starting state.

### 2. Improve Error Visibility
- Ensure the `error` state in `NewMatchPage` is displayed to the user if match creation fails.

## Verification Steps
- **Manual Testing**:
  - Navigate to the "New Match" page.
  - Select "Cricket" -> "Classic Match".
  - Configure rules and select at least 1 player for each team.
  - Press "Start Match" and verify it navigates to the Match Room.
  - Verify that the Match Room loads with the correct teams and starting players assigned.
  - Repeat for "Backyard Mode" to ensure it also works as expected.
