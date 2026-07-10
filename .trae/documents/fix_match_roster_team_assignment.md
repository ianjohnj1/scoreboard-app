# Plan: Cricket Roster & Match Summary Polish

## Summary
We will polish the Cricket match room to correctly handle team assignments for new players in Classic mode, clarify the dynamic fielding/bowling team behavior in Backyard mode, and implement a comprehensive "End of Match" summary view (similar to Darts and Chip Off) that freezes inputs and displays final statistics.

## Current State Analysis & Clarifications
1. **Team Assignment**: In Classic Cricket, new players added via the "Edit Roster" modal are inserted with a null `team_id`, making them invisible to the batting/bowling selectors.
2. **Backyard Mode Dynamics**: Backyard mode is an individual sport where the fielding/bowling team dynamically changes. When a batter is dismissed, they join the fielding pool, and a new batter is selected from all players. Currently, the `bowlingPlayers` list includes the active batters, which breaks this logical separation. 
3. **End of Match**: When max overs or wickets are reached, the game simply throws a browser `alert()` and stops. There is no post-match summary, and no way to smoothly rematch or exit to the dashboard.

## Proposed Changes

### 1. Match Roster Team Assignment (Classic Mode)
- **File**: `src/pages/MatchRoomPage.tsx`
- **What**: Introduce a `selectedTeamId` state. In the `showEditRoster` modal, if `teams.length > 0` (Classic mode), display a toggle to select which team the new player/guest should join.
- **Why**: Ensures that when `handleAddPlayer` or `handleAddGuest` is called, the player receives a valid `team_id` and appears in the Cricket room dropdowns.

### 2. Refine Backyard Mode Roster Dynamics
- **File**: `src/components/sports/CricketRoom.tsx`
- **What**: Modify the `bowlingPlayers` derived state in Backyard mode to strictly exclude `current_batter1_id` and `current_batter2_id`.
- **Why**: Clarify that in cricket backyard mode is treated as an individual sport but the bowler and fielders play as a team that dynamically changes. When a batter is dismissed, he joins the fielding and bowling team and a new batter is selected from all players in the match or a new guest. This reinforces the concept that the bowler and fielders play as a dynamic team against the active batters. When a batter is dismissed, they are removed from the active batting slots and instantly become available in the `bowlingPlayers` pool. Newly added guests will also instantly populate into both the batting and bowling available pools.

### 3. Implement End of Match Helper & Summary View
- **File**: `src/components/sports/CricketRoom.tsx`
- **What**: 
  - **Completion Trigger**: Replace the `alert("Maximum overs reached!")` and `alert("Maximum wickets reached!")` calls with a prompt or automatic trigger that calls `completeMatchWithWinner(match.id, winnerId)`. For Backyard mode, we can add a manual "End Match" button or trigger it when all players have batted.
  - **Match Summary UI**: When `match.status === 'completed'` or `match.winner_profile_id` is set:
    - Hide the active scoring tray and active bowler ticker.
    - Render a "Match Complete" summary view featuring a Trophy icon.
    - Display a final sorted Batting Leaderboard (by runs) and Bowling Leaderboard (by wickets).
    - Provide `[ Rematch ]` and `[ Exit to Dashboard ]` action buttons, mirroring the Darts and Chip Off rooms.
    - Implement the `handleRematch` function to duplicate the match configuration and route the user to a new room.

## Verification
- Add a new guest in a Classic match; ensure they can be assigned a team and selected to bat.
- Add a new guest in a Backyard match; ensure they are immediately available to bat/bowl.
- Verify that active batters in Backyard mode cannot be selected as the active bowler.
- Trigger the end of a match (via max overs/wickets or manual completion) and verify the Match Summary renders correctly with the final stats and navigation buttons.