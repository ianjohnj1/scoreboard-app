# Plan: Polish Chip Off Match Room and Match Summaries

## Summary
The goal is to polish the "Chip Off" match room by implementing an end-of-match summary view that replaces the scoring pad when the game completes, mirroring the flow in the Darts room. The summary will display detailed stats recorded during that match. Additionally, we will verify and enhance the existing Darts post-match summary to ensure it displays the correct advanced metrics (e.g., 3-Dart Avg, First 9 Avg) for its respective sub-games.

## Current State Analysis
1. **Chip Off Room (`ChipOffRoom.tsx`)**: Currently, the game detects the end of the final round and shows a "Round Complete" modal, but it does not call `completeMatchWithWinner` to finalize the match in the database, nor does it have a dedicated post-match summary view.
2. **Darts Room (`DartsRoom.tsx`)**: The game successfully completes and shows a "Match Complete" view. However, this view only displays high-level match totals ("Total Turns" and "Darts Thrown") rather than the advanced player-specific metrics (like 3-Dart Avg or Checkout %) requested by the user.

## Proposed Changes

### 1. Chip Off Match Room (`src/components/sports/ChipOffRoom.tsx`)
- **Finalize Match**: Inside `handleScore`, when the final ball of the final round is played, calculate the final winner based on points (and tie-breaker 10s) and call `completeMatchWithWinner(match.id, winnerProfileId)`.
- **Match Summary UI**: Update the rendering logic. If the game is over (`gameStats.isGameOver` or `match.winner_profile_id` is set), hide the scoring pad and display a Match Summary inline.
- **Detailed Metrics**: In the summary, display a breakdown per player containing:
  - Total Points
  - Total Chips Thrown
  - Aces (10s)
  - Inner Circle (5s)
  - Outer Circle (2s)
  - Misses (0) & Hazards (-1)
- **Navigation**: Add the `[ Rematch ]` and `[ Dashboard ]` buttons to allow quick replay or exit.

### 2. Darts Match Room (`src/components/sports/DartsRoom.tsx`)
- **Enhance Match Summary UI**: Refactor the "Match Complete" screen to display a grid of player-specific metrics derived from `state.turns`.
- **Variant-Specific Metrics**:
  - **Countdown (501/301)**: Calculate and display *Darts Thrown*, *3-Dart Avg*, and *First 9 Avg* for that specific match.
  - **Around the World**: Display *Darts Thrown*.
  - **Killer**: Display *Darts Thrown* and *Lives Remaining*.

## Assumptions & Decisions
- The match-specific metrics in the summary only need to reflect the current active match state (derived from `events` in Chip Off and `state.turns` in Darts).
- The visual style for the summary cards will match the existing UI tokens (dark charcoal backgrounds, neon borders, mono fonts).

## Verification Steps
1. Play a quick game of Chip Off to completion. Verify the match completes cleanly, the database is updated with a winner, and the new Match Summary displays the correct stats (10s, 5s, 2s, etc.) and action buttons.
2. Play a quick game of Darts (Countdown). Verify the post-match summary now breaks down the stats per player, correctly showing the calculated 3-Dart Average and First 9 Average for that specific match.