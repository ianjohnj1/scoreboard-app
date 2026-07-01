# Plan: Refine Backyard Cricket Logic - Player Selection & Over Management

This plan implements specialized logic for Backyard Cricket to enforce role exclusion and automate over completion when players are swapped mid-over.

## Current State Analysis
- **Player Selection**: `CricketRoom.tsx` uses `ActivePlayerOverlay` to select strikers, non-strikers, and bowlers. Currently, all players in the pool are selectable, allowing a player to be both the batter and the bowler simultaneously.
- **Over Management**: Deliveries are recorded one by one. Overs only end when the ball count reaches a multiple of 6.
- **Backyard Mode**: The app already distinguishes between `classic` and `backyard` variants via `ctx.isBackyard`.

## Proposed Changes

### 1. Enforce Role Exclusion in UI (`src/components/sports/CricketRoom.tsx`)
- Modify `ActivePlayerOverlay` to accept an `excludeIds` prop (array of profile IDs).
- Filter the `<select>` options in `ActivePlayerOverlay` to hide players whose IDs are in `excludeIds`.
- In `CricketRoom.tsx`:
    - For **Striker** selection: Exclude the current Bowler and Non-Striker.
    - For **Non-Striker** selection: Exclude the current Bowler and Striker.
    - For **Bowler** selection: Exclude both the Striker and Non-Striker.

### 2. Implement Automated Over Completion (`src/components/sports/CricketRoom.tsx`)
- Create a helper function `completeOverEarly(innings, currentBatterId, currentBowlerId)`:
    - Check if `innings.balls % 6 !== 0`.
    - Calculate `ballsRemaining = 6 - (innings.balls % 6)`.
    - Loop `ballsRemaining` times:
        - Record a `delivery` event with 0 runs.
        - Update `innings.balls` in the database.
        - Update `cricket_player_stats` for both the batter and bowler (incrementing `bat_balls`/`bat_dots` and `bowl_balls` respectively).
- Integrate `completeOverEarly` into `updateBatter` and `updateBowler`:
    - Before updating the player ID in the database, check if `ctx.isBackyard` is true.
    - If true, call `completeOverEarly` using the *current* active IDs.
    - Proceed with the ID update.

### 3. Handle State Synchronization
- Ensure that `completeOverEarly` uses `supabase.from(...).update(...)` calls that wait for completion or are handled as a batch to prevent race conditions during the player switch.
- Refresh the local state via `loadInnings()` after the over is completed and the new player is assigned.

## Assumptions & Decisions
- **Dot Ball Attribution**: Remaining balls will be attributed to the batter and bowler who were active *at the moment the switch was initiated*.
- **Backyard Only**: These rules will only apply when `house_rules.variant === 'backyard'`.
- **Event Log**: Each "automatic" dot ball will be recorded as a separate event in `match_events` to maintain a consistent historical log that adds up to 6 balls per over.

## Verification Steps
1. **Selection Lockout**:
    - Start a Backyard Cricket match.
    - Assign "Player A" as the Striker.
    - Open the Bowler selection dropdown; verify "Player A" is not visible.
2. **Mid-Over Switch (Bowler)**:
    - Bowl 2 balls (Over: 0.2).
    - Select a new Bowler.
    - Verify:
        - The Over count jumps to 1.0.
        - The previous Bowler's stats show 6 balls bowled.
        - The match event log shows 4 additional "0" run deliveries.
3. **Mid-Over Switch (Batter)**:
    - Bowl 4 balls (Over: 0.4).
    - Select a new Striker.
    - Verify the Over count jumps to 1.0 and stats are updated accordingly.
