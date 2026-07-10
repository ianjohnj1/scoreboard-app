# Plan: Leaderboard Polish

## Summary
The goal is to refine the global MVP leaderboard by replacing the "Unknown Sport" label with the player's "Best Sport" (the sport where they earned the most season points). Additionally, the redundant "Chip Off" tab will be removed, and the sport selection tabs will be optimized for better desktop usability and smoother mobile scrolling.

## Current State Analysis
1. **LeaderboardPage (`src/pages/LeaderboardPage.tsx`)**:
   - The Global MVP (`sport === 'all'`) aggregation maps the sport field to `'all'`, which `getSportLabel` incorrectly parses as "Unknown Sport".
   - The `sports` array includes `'chip_off'`, creating a duplicate view since Chip Off stats are aggregated under Golf.
   - The sport selection tabs use an `overflow-x-auto` wrapper with `style={{ width: 'max-content' }}`, making it a single horizontal scroll line on both mobile and desktop.

## Proposed Changes

### 1. Track 'Best Sport' during Global MVP Aggregation
- **File**: `src/pages/LeaderboardPage.tsx`
- **What**: In the `reduce` function inside the `if (sport === 'all')` block, track the player's best sport.
- **How**: 
  - Add `best_sport: curr.sport` and `max_sport_sp: curr.season_points` to the initial accumulator object for each profile.
  - As we iterate, check `if (curr.season_points > acc[pid].max_sport_sp)`, and if so, update `max_sport_sp` and `best_sport` for that profile.

### 2. Update Player Card UI to Display Best Sport
- **File**: `src/pages/LeaderboardPage.tsx`
- **What**: Update the rendering of the sport label in the list view.
- **How**: 
  - Locate the `getSportLabel(entry.sport)` call inside the player cards.
  - Modify it to conditionally display the best sport when in Global MVP mode: 
    `{sport === 'all' && entry.best_sport ? \`Best Sport: ${getSportLabel(entry.best_sport)}\` : getSportLabel(entry.sport)}`

### 3. Remove "Chip Off" Tab
- **File**: `src/pages/LeaderboardPage.tsx`
- **What**: Remove `'chip_off'` from the `sports` array.
- **How**: Change `const sports = ['all', 'cricket', 'chip_off', 'golf', ...]` to `const sports = ['all', 'cricket', 'golf', ...]`.

### 4. Refine Tab Selections for Desktop and Mobile
- **File**: `src/pages/LeaderboardPage.tsx`
- **What**: Improve the layout of the sport tabs so they wrap on desktop and snap-scroll on mobile.
- **How**: 
  - Remove `style={{ width: 'max-content' }}` from the tabs container.
  - Add responsive classes: `sm:flex-wrap`, `snap-x`, and `snap-start` to ensure the tabs wrap gracefully on larger screens while retaining a swipeable horizontal layout on smaller devices. Ensure text does not wrap inside the buttons using `whitespace-nowrap`.

## Assumptions & Decisions
- The definition of "Best Sport" is exclusively based on the highest `season_points` the player has accumulated in a single sport.
- Chip Off is adequately represented within Golf stats, making its separate tab unnecessary as per user confirmation.

## Verification Steps
1. Navigate to the Leaderboard page.
2. Confirm the "Chip Off" tab is gone.
3. On the "Global MVP" tab, verify that player cards display "Best Sport: [Sport]" instead of "Unknown Sport".
4. Check the tab bar on desktop (tabs should wrap if needed) and on mobile (tabs should be horizontally scrollable).