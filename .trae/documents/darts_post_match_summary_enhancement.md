# Plan: Darts Post-Match Summary Enhancement

## Summary
The goal is to enhance the post-match summary view in the `DartsRoom.tsx` component so that it displays variant-specific detailed metrics (e.g., 3-Dart Average, First 9 Average, Darts Thrown, Lives Remaining) for each player, matching the style and detail level of the recently updated Chip Off match room.

## Current State Analysis
1. **Darts Room (`src/components/sports/DartsRoom.tsx`)**: 
   - Currently, when `state.winner` is truthy, the game shows a "Match Complete" view.
   - However, this view only displays high-level match totals ("Total Turns" and "Darts Thrown" for the entire match), not broken down by player.
   - The user wants advanced player-specific metrics displayed in the summary.

## Proposed Changes

### 1. Calculate Player-Specific Stats (`DartsRoom.tsx`)
- Add a `useMemo` hook `matchStats` to calculate stats for each player from `state.turns`.
- Iterate through `matchPlayers` and compute:
  - **Darts Thrown**: Sum of `darts.length` for all turns by the player.
  - **Countdown (501/301)**:
    - *3-Dart Average*: `(Total Points / Darts Thrown) * 3` (Points are computed from `turn.total` where `!bust`).
    - *First 9 Average*: `(Points in first 9 darts / min(9, Darts Thrown)) * 3`.
  - **Killer**:
    - *Lives Remaining*: Retrieve from `state.killer.players[playerId].lives`.
- Sort the players so that the winner appears first.

### 2. Update the "Match Complete" UI (`DartsRoom.tsx`)
- Replace the existing high-level total turns/darts cards with a player-by-player leaderboard, similar to the `ChipOffRoom` structure.
- For each player, display their Avatar, Name, and an indicator if they are the winner.
- Render a grid of metric cards beneath each player's name based on the active variant:
  - **Countdown**: Show `[ DARTS ]`, `[ 3-DART AVG ]`, `[ FIRST 9 AVG ]`.
  - **Around the World**: Show `[ DARTS THROWN ]`.
  - **Killer**: Show `[ DARTS THROWN ]`, `[ LIVES ]`.
- Retain the `[ Rematch ]` and `[ Dashboard ]` buttons below the leaderboard.

## Assumptions & Decisions
- A player's 3-Dart Average and First 9 Average can be calculated using the `scoredPoints` from their non-bust darts/turns in the current match session. If a turn is a bust, its score for average calculation purposes is 0.
- The visual style will match the `ChipOffRoom` (using `bg-charcoal-800`, `border-charcoal-700`, `font-mono`, and neon accents).

## Verification Steps
1. Navigate to the Darts room and complete a quick game of Countdown (501/301).
2. Verify that the post-match summary displays each player's individual 3-Dart Avg, First 9 Avg, and Darts Thrown correctly.
3. Verify that the "Rematch" and "Dashboard" buttons still function.
