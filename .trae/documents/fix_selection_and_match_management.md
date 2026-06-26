# Plan: Fix Match Room Selection and Add Match Management

This plan addresses two issues:
1.  **Cricket Selection Bug**: Investigating and fixing why batters and bowlers cannot be selected in the match room (specifically for Backyard Cricket).
2.  **Match Management**: Adding the ability to delete matches from the Dashboard and History pages to clean up "spammed" test data.

## Current State Analysis
- **Selection Bug**: In Backyard Cricket, matches are created without teams. The `CricketRoom` component relies on `cricket_innings` which might be failing to initialize or load correctly due to missing team references or RLS issues.
- **Match Spam**: The dashboard displays all recent matches globally. There is currently no way for a user to delete a match they created.

## Proposed Changes

### 1. Fix Cricket Selection Logic
I will improve the robustness of the innings initialization and player selection in `CricketRoom.tsx`.

- **File**: `src/components/sports/CricketRoom.tsx`
    - Update `startFirstInnings` to explicitly handle `null` team IDs for Backyard matches.
    - Add better error handling and state synchronization after updating batters/bowlers.
    - Ensure `battingPlayers` and `bowlingPlayers` lists are correctly derived even when teams are undefined.
- **File**: `src/pages/MatchRoomPage.tsx`
    - Ensure `isBackyard` flag is consistently detected from `house_rules`.

### 2. Add Match Deletion Functionality
I will add a deletion mechanism to allow users to clean up their match history.

- **File**: `src/lib/matches.ts`
    - Add `deleteMatch(matchId: string)` function to perform the Supabase deletion.
- **File**: `src/pages/Dashboard.tsx`
    - Add a delete button (trash icon) to the `MatchCard` component.
    - Implement a confirmation dialog before deletion.
    - Refresh the match lists after a successful deletion.
- **File**: `src/pages/HistoryPage.tsx`
    - Add similar deletion functionality to the history list.

### 3. Database Policies (Implicit)
- I will ensure the SQL policies proposed in the previous step (if not already applied by the user) are compatible with the `DELETE` operation.

## Verification Steps
1.  **Verify Selection**:
    - Create a new Backyard Cricket match.
    - Enter the match room.
    - Verify that the "Batter 1", "Batter 2", and "Bowler" dropdowns are populated with the added players.
    - Select a player and verify the UI updates and the selection persists after refresh.
2.  **Verify Deletion**:
    - Go to the Dashboard.
    - Click the delete icon on a test match.
    - Confirm the deletion.
    - Verify the match is removed from the list and no longer exists in Supabase.
