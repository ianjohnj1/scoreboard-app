# Plan: Refine Backyard Cricket Logic v2

This plan aims to improve the flexibility and practical use of **Backyard Cricket** by allowing mid-over player role swaps, automating over completion, and providing an individual-centric UI.

## Current State Analysis
- **Backyard Mode**: Currently skips strike rotation and uses a simplified roster where everyone can bat or bowl.
- **Roster Management**: Mid-game adding/removing is supported in `MatchRoomPage.tsx`, but role transitions in `CricketRoom.tsx` are static.
- **UI**: The header displays team-based scores, which is less relevant in Backyard mode where individual performance is the focus.
- **Over Integrity**: Mid-over swaps currently leave overs incomplete (e.g., 0.3 overs), which complicates the "turn-based" nature of backyard play.

## Proposed Changes

### 1. Individual-Centric Header (`src/components/sports/CricketRoom.tsx`)
- Modify the "Broadcast Header Ticker" to detect `isBackyard`.
- **Batter Block**: Show the active batter's name, runs, and balls faced prominently.
- **Bowler Block**: Add a dedicated area in the header for the active bowler's stats (wickets/runs and current over progress).
- **Design**: High-contrast, thumb-friendly layout for quick reading during play.

### 2. Automated Over Completion (`src/components/sports/CricketRoom.tsx`)
- Implement `completeOverEarly` helper function.
- Logic:
    1. Calculate `remainingBalls = 6 - (innings.balls % 6)`.
    2. If `remainingBalls < 6`:
        - Record dot-ball `delivery` events for the remainder.
        - Update `cricket_innings` balls count.
        - Update `cricket_player_stats` for the current bowler.
- Trigger `completeOverEarly` automatically in `updateBatter` and `updateBowler` if:
    - The `isBackyard` flag is true.
    - A swap occurs mid-over (balls % 6 != 0).
    - Specifically, when the `currentBowler` is selected as the new `currentBatter1`.

### 3. Selection Logic Refinement (`src/components/sports/CricketRoom.tsx`)
- Allow the active bowler to be selected as a batter without manual role clearing.
- Ensure `updateBatter` and `updateBowler` handle the transition state correctly to prevent UI flickering or state mismatches.

### 4. Roster Management Verification (`src/pages/MatchRoomPage.tsx`)
- Ensure "Add/Remove" buttons are accessible during an active match.
- Verify that removing a player doesn't break `CricketRoom` if they were the active batter/bowler (add guards).

## Verification Plan
- **Manual Testing**:
    - Start a Backyard Cricket match.
    - Record 3 balls for Bowler A.
    - Select Bowler A as the new Batter.
    - Verify: Over is completed (shows 1.0), Bowler A's stats show 6 balls bowled, and Bowler A is now the active batter.
    - Verify: UI header shows Bowler A's personal runs/balls instead of team total.
    - Add a new guest mid-game and select them as the next bowler.
- **Data Integrity**:
    - Check Supabase `match_events` to ensure dot balls are recorded correctly during automated completion.
