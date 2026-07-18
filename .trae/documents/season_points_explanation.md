# Plan: Investigate and Explain Season Points Accumulation

## Summary
The user requested an investigation into how "Season Points" (SP) are accumulated, a summary of this logic, and the addition of an in-app button/modal on the Leaderboard page to explain this to the users. We will centralize the SP logic in `src/lib/stats.ts` to make it a single source of truth, preventing future drift, and we'll add an interactive modal in `LeaderboardPage.tsx` that reads directly from this configuration.

## Current State Analysis
1. **Calculation Logic**: Season Points are currently hardcoded in two places inside `src/lib/stats.ts`:
   - `updateCareerStats`: Saves SP permanently to the database when a match completes.
   - `getGlobalLeaderboardData`: Aggregates SP dynamically for the leaderboard.
2. **Current Rules**:
   - **Placement**: 1st = 100 SP, 2nd = 50 SP, 3rd = 25 SP, Completion (4th+) = 10 SP.
   - **Cricket Milestones**: >= 50 runs = 50 SP, >= 3 wickets = 30 SP.
   - **Golf/Chip Off Milestones**: Each Hole-In-One or "10" Ace = 50 SP.
3. **Issue**: Because the rules are hardcoded as plain integers deep in the logic, they are not easily explainable to the user via the UI.

## Proposed Changes

### 1. `src/lib/stats.ts`
- **What**: Centralize the Season Point rules into an exported configuration object.
- **How**:
  - Add a new exported constant `SEASON_POINT_RULES` that maps out the placement and milestone values along with user-friendly descriptions.
  - Add a helper function `calculatePlacementSP(rank: number)` to return the SP based on the rank.
  - Refactor `updateCareerStats` and `getGlobalLeaderboardData` to use `calculatePlacementSP(rank)` instead of their hardcoded `if (rank === 1) placementSP = 100` blocks.

### 2. `src/pages/LeaderboardPage.tsx`
- **What**: Add an interactive "How are Season Points calculated?" button and modal.
- **How**:
  - Add state `showSPModal` (boolean).
  - Add an info button underneath the "Global rankings across all sports" subtitle.
  - Implement a `Modal` component (reusing the existing `src/components/Modal.tsx`) that iterates over `SEASON_POINT_RULES` and displays a clean, neon-styled breakdown of:
    - **Match Placements**: 1st, 2nd, 3rd, and Completion.
    - **Sport Milestones**: Cricket bonuses and Golf/Chip Off bonuses.

## Assumptions & Decisions
- **Decision**: By using a single `SEASON_POINT_RULES` constant, any future developer (or agent) can update the rules in one place, and the UI modal will automatically reflect the new rules.
- **UI Design**: The modal will use the existing `Prime Time Neon` aesthetic with appropriate icons (e.g., Trophy for placement, Target for darts/golf, Activity for cricket).

## Verification Steps
1. Navigate to the Leaderboards page.
2. Verify the new "How are Season Points calculated?" button is visible.
3. Click the button and ensure the modal correctly displays the rules defined in `stats.ts`.
4. Play a test match (or verify code logic) to ensure the refactored `stats.ts` still assigns SP correctly.