# Plan: Refine Cricket Match Room and Scoring Engine for Backyard Mode

This plan focuses on implementing specific "Backyard Mode" logic for the cricket scoring engine, ensuring individual tracking, automated batter rotation, and structured over management.

## Current State Analysis
- `CricketRoom.tsx` handles both Classic and Backyard modes but lacks specific rotation logic for Backyard mode.
- Batter rotation on wickets currently just moves Batter 2 to Batter 1, which isn't ideal for the queue-based Backyard format.
- There is no automated bowler rotation prompt at the end of an over.
- Scoring logic for extras in Backyard mode needs to be strictly tied to house rules.

## Proposed Changes

### 1. Define Cricket House Rules Interface
- Add a typed interface for cricket house rules in `src/components/sports/CricketRoom.tsx`:
  ```typescript
  interface CricketHouseRules {
    no_noballs?: boolean;
    no_wides?: boolean;
    max_overs?: number;
    max_wickets?: number;
    variant?: 'classic' | 'backyard';
  }
  ```

### 2. Implement Queue-Based Batter Rotation
- In `handleWicket`, if `isBackyard` is true:
  - Find all players in the match.
  - Filter out those who have already been dismissed (using `playerStats`).
  - Find the player with the next highest `batting_order` relative to the dismissed batter.
  - If no "next" player exists, cycle back to the first available player or end the match if everyone has hit the `max_wickets` cap.
  - Update `current_batter1_id` with this player and keep `current_batter2_id` as `null`.

### 3. Refine Scoring for Extras (Backyard Mode)
- In `handleDelivery`:
  - Check `house_rules.no_wides` and `house_rules.no_noballs`.
  - If `no_wides` is true, a Wide increments the ball count but still adds runs.
  - If `isBackyard`, ensure that if `current_batter2_id` is missing, the game continues without forcing a selection.

### 4. Implement Over-Based Bowler Rotation
- Add a state `showBowlerModal` in `CricketRoom.tsx`.
- In `handleDelivery`, check if `(innings.balls + 1) % 6 === 0`.
- If true, set `showBowlerModal(true)` after recording the delivery.
- Create a modal that forces the selection of a new bowler from the player pool.

### 5. Match End Conditions
- Implement a check in `handleDelivery` and `handleWicket`:
  - End match if `innings.balls >= (houseRules.max_overs * 6)`.
  - End match if `innings.wickets >= houseRules.max_wickets`.

### 6. UI Adjustments
- Update `PlayerSelector` to handle `null` values more gracefully.
- Ensure the batters scorecard correctly reflects dismissed players in Backyard mode.

## Verification Steps
- **Manual Testing**:
  - Start a Backyard Cricket match.
  - Record runs and extras, verifying batter stats update correctly.
  - Record a wicket and verify the next player in the queue is automatically promoted.
  - Complete an over and verify the bowler rotation prompt appears.
  - Verify match ends correctly when limits are reached.
- **UI Verification**:
  - Use `OpenPreview` to check the scoring interface layout and modal behavior.
