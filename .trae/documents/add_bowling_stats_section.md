# Plan: Add Bowling Stats Section to Cricket Match Room

The goal is to add a dedicated "Bowling Analysis" section to the Cricket Match Room, displaying stats for all bowlers in a professional broadcast style, consistent with the existing batting scorecard.

## Current State Analysis
- The `CricketRoom.tsx` component currently displays a "Full Scorecard" for batting stats.
- It calculates and stores bowling stats in the `playerStats` map (wickets, runs, balls).
- The `bowlingPlayers` array identifies which players are on the bowling team (or all players in backyard mode).
- The current layout has space below the batting scorecard to display bowling figures.

## Proposed Changes

### 1. Create Bowling Stats Section in `src/components/sports/CricketRoom.tsx`
- Add a new section titled "Bowling Analysis" below the batting scorecard.
- Header columns: `OVERS`, `MAIDENS` (optional/placeholder), `RUNS`, `WICKETS`, `ECON`.
- Map through `bowlingPlayers` and display their stats from the `playerStats` map.

### 2. Styling & UX
- **Highlight Active Bowler**: Apply a specific border (e.g., `border-l-4 border-success-500`) and background to the player currently selected as the `currentBowler`.
- **Broadcast Theme**: Use `font-mono` for all numeric stats, high-contrast colors for wickets, and a compact, clean layout.
- **Responsive Design**: Ensure columns align well on both mobile and desktop.

### 3. Logic Refinement
- **Economy Calculation**: Use the helper logic: `stat && stat.bowl_balls > 0 ? ((stat.bowl_runs / stat.bowl_balls) * 6).toFixed(2) : '0.00'`.
- **Overs Calculation**: Format balls as `Overs.Balls` (e.g., `3.4`).

## Implementation Steps

### Phase 1: Layout Insertion
- Insert the "Bowling Analysis" container after the `Full Scorecard` div.
- Implement the header row with consistent spacing.

### Phase 2: Player Mapping
- Map through `bowlingPlayers`.
- Filter out players who haven't bowled yet (unless they are the `currentBowler`).
- Render individual bowler rows with their respective stats.

### Phase 3: Visual Polish
- Apply the highlight styles for the active bowler.
- Ensure transitions and hover effects match the batting section.

## Verification Steps
- **Manual Testing**:
  - Assign a bowler and record some deliveries.
  - Verify that the bowling stats (Runs, Balls, Wickets) update in real-time in the new section.
  - Check that the Economy calculation is accurate.
  - Ensure the `currentBowler` is visually distinct from others.
- **Visual Check**:
  - Use `OpenPreview` to confirm the alignment and readability of the new section.
