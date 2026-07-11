# Plan: Update Chip Off Spectator View

## Summary
The Chip Off spectator room is currently rendering a simplified leaderboard at the bottom of the page, rather than the detailed metrics (Chips, 10s, 5s, 2s) seen in the post-match summary. Additionally, we want to rename the "10s" column to "Hole in One" for better golf flavor. 

## Current State Analysis
- **File**: `src/components/sports/ChipOffRoom.tsx`
- The `isSpectator` mode disables the scoring buttons (correctly), but simply falls back to the generic `Leaderboard` section at the bottom of the active match UI (lines 457-498), which only shows total points and "10s".
- The detailed grid (Chips, 10s, 5s, 2s) is currently only rendered when `gameStats.isGameOver` or `match.winner_profile_id` is true (lines 334-366).
- The label "10s" is hardcoded in both the scoring buttons and the leaderboards.

## Proposed Changes

### 1. Rename "10s" to "Hole in One"
- **File**: `src/components/sports/ChipOffRoom.tsx`
- **What/How**:
  - In the Post-Match / Detailed summary grid (line 351), change `<p>10s</p>` to `<p>Hole-In-One</p>` (and maybe adjust the text size `text-[8px]` so it fits).
  - In the simple active Leaderboard header (line 462), change `<span>10s</span>` to `<span>Holes in 1</span>` (or `H-I-O` if space is tight).

### 2. Render Detailed Stats for Spectators
- **File**: `src/components/sports/ChipOffRoom.tsx`
- **What/How**:
  - Update the rendering logic in the `Main Content Area`.
  - Instead of strictly checking `(gameStats.isGameOver || match.winner_profile_id)` to show the detailed summary view, we will check `(gameStats.isGameOver || match.winner_profile_id || isSpectator || isTvDisplayMode)`.
  - If it is an active match being spectated, we will change the "Match Complete" header text to "Live Leaderboard" and hide the big Trophy icon.
  - This effectively turns the spectator/TV mode into a live dashboard of all advanced metrics (Chips, Hole-In-Ones, 5s, 2s).

## Verification
1. Open a live Chip Off match as a player (verify scoring buttons still work).
2. Open the spectator link.
3. Verify the spectator sees the full grid of detailed metrics for all players.
4. Verify the label "10s" has been changed to "Hole-In-One" or "Holes in 1" in the detailed grid.