# Plan: Add Dedicated "Miss" Button to Chip Off Mini Game

This plan outlines the addition of a dedicated scoring button for a "Miss" (0 points) in the Chip Off golf mini-game, ensuring it is always available even when the hazard penalty is enabled.

## Summary
- **Goal**: Add a scoring button that always records 0 points and advances the game state.
- **Context**: Currently, the 0-point button is combined with the "Hazard Penalty" button when that rule is enabled.
- **Proposed Layout**: A dedicated "MISS" button will be added. If "Hazard Penalty" is enabled, both "MISS" (0) and "HAZARD" (-1) buttons will be displayed in the scoring pad.

## Proposed Changes

### 1. Update ChipOffRoom.tsx
- **[ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx)**
    - Modify the scoring pad grid to include a dedicated **MISS** button that calls `handleScore(0)`.
    - If `hazardPenalty` is enabled, adjust the layout so that both **MISS** (0 points) and **HAZARD** (-1 point) buttons are visible.
    - Style the **MISS** button to be prominent and thumb-friendly, matching the existing "Backyard" aesthetic.

## Assumptions & Decisions
- **Decision**: If `hazardPenalty` is enabled, the bottom row of the scoring grid will be split into two buttons: [0 - MISS] and [-1 - HAZARD].
- **Decision**: If `hazardPenalty` is disabled, the bottom row will feature a single large [0 - MISS] button.

## Verification Steps
1. **With Hazard Penalty Disabled**:
    - Start a Chip Off match with Hazard Penalty OFF.
    - Verify there is a large "MISS" button that adds 0 points and advances the ball/turn.
2. **With Hazard Penalty Enabled**:
    - Start a Chip Off match with Hazard Penalty ON.
    - Verify there are two separate buttons: "MISS" (0 points) and "HAZARD" (-1 point).
    - Verify both buttons correctly record scores and advance the ball/turn.
