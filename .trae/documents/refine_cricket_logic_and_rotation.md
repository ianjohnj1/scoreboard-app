# Plan: Refine Cricket Score Logic and Implement Batter Strike Rotation

This plan addresses the intermittent scoring registration issue and implements automatic strike rotation for classic cricket matches.

## Current State Analysis
- Scoring sometimes requires double-clicks, possibly due to race conditions between state updates and database writes, or component re-renders during the `async` flow.
- Batter strike rotation (swapping Batter 1 and Batter 2) is currently manual.
- Standard cricket rules require rotation on odd runs (1, 3, 5) and at the end of an over.

## Proposed Changes

### 1. Fix Intermittent Scoring Registration
- In `CricketRoom.tsx`, review the `handleDelivery` function.
- Optimize the `async` flow to ensure the `loading` state is handled correctly and prevent concurrent clicks.
- Ensure the `inningsUpdate` and `batterUpdate` are consolidated or sequenced properly to avoid state drift.
- Add local state optimistic updates or ensure the UI reflects the "loading" state immediately to prevent multiple clicks.

### 2. Implement Automatic Strike Rotation
- In `handleDelivery`:
  - Calculate `shouldSwap` based on the following:
    - If `runs` is 1, 3, or 5 (and not an extra like Wide/No Ball that doesn't involve running).
    - If it's the end of an over (`countsAsBall && (innings.balls + 1) % 6 === 0`).
  - If `shouldSwap` is true and `current_batter2_id` is present:
    - Swap `current_batter1_id` and `current_batter2_id` in the `inningsUpdate` object.
    - Note: If both conditions are true (e.g., a single on the last ball of an over), the rotations cancel out in many house rules, but typically in standard cricket, you swap for the run and then the over end rotation happens. We will implement the standard logic: `swapCount = (oddRuns ? 1 : 0) + (endOfOver ? 1 : 0); if (swapCount % 2 !== 0) { /* swap */ }`.

### 3. Refine Wicket Rotation
- Ensure that when a wicket falls, the non-striker (`Batter 2`) always becomes the striker (`Batter 1`) for the next ball, regardless of whether a new batter is selected immediately.

## Verification Steps
- **Manual Testing**:
  - Start a Classic Cricket match with two batters selected.
  - Score 1 or 3 runs and verify the batters swap slots in the UI.
  - Score a boundary (4 or 6) and verify they stay in their slots.
  - Complete an over and verify the batters swap (if the last ball was a dot/even run).
  - Verify that rapid clicking on score buttons is disabled while a delivery is being processed.
- **UI Verification**:
  - Use `OpenPreview` to observe the smooth transition of batter slots during rotation.
