# Plan: Fix Golf Leaderboard and Connect Chip Off

## Summary
Currently, the leaderboard fails to display Chip Off Hole-In-Ones (Aces) for players because Chip Off matches are recorded under `sport: 'golf'` in the database, but the leaderboard aggregation logic (`stats.ts`) doesn't check the `house_rules.variant` to properly map Chip Off points and aces. We will fix this aggregation so Chip Off matches contribute to the unified "Golf" tab. We will also update the Golf tab UI to display matches played, wins, best classic score, best chip off score, and total hole in ones.

## Current State Analysis
1. **The Disconnect**: In `src/lib/stats.ts`, `getGlobalLeaderboardData()` iterates over `match_rooms`. For Chip Off matches, `match.sport` is `'golf'`. The logic incorrectly assigns `score = s.strokes` (which is 0 for Chip Off) and only increments `golf_lifetime_hio` from `ms.extra.hio` (Classic Golf HIOs), completely ignoring `ms.extra.tens` (Chip Off Aces).
2. **Leaderboard UI**: In `LeaderboardPage.tsx`, the Golf tab currently only shows "Best" and "HIO", and sorts by lowest `best_score`. Because we are merging two different scoring systems (strokes vs points), this sort logic is flawed.

## Proposed Changes

### 1. `src/lib/stats.ts`
- **What**: Update `getGlobalLeaderboardData()` to identify Chip Off matches and aggregate them correctly into the unified `'golf'` profile.
- **How**:
  - Add `const isChipOff = match.sport === 'golf' && (match.house_rules as any)?.variant === 'chip_off';` inside the match processing loop.
  - In the `getPlayerStats` initializer, add `best_score_classic: null` and `best_score_chip_off: null`.
  - Update score assignment: 
    ```typescript
    if (match.sport === 'golf') {
      score = isChipOff ? s.points : s.strokes;
    }
    ```
  - Update placement sorting to sort Chip Off by highest points and Classic Golf by lowest strokes.
  - Update HIO and Milestone aggregation to properly include `ms.extra.tens` for Chip Off:
    ```typescript
    if (match.sport === 'golf') {
      g.golf_lifetime_hio += (ms.extra.hio || 0) + (ms.extra.tens || 0);
      milestoneSP += ((ms.extra.hio || 0) + (ms.extra.tens || 0)) * 50;
      
      // Update specific best scores
      if (isChipOff) {
        g.best_score_chip_off = Math.max(g.best_score_chip_off || 0, ms.score);
      } else {
        if (ms.score > 0) {
          g.best_score_classic = g.best_score_classic ? Math.min(g.best_score_classic, ms.score) : ms.score;
        }
      }
    }
    ```

### 2. `src/pages/LeaderboardPage.tsx`
- **What**: Update the Golf tab UI to display the new comprehensive stats and fix the sorting.
- **How**:
  - Update `LeaderboardEntry` type to include `best_score_classic` and `best_score_chip_off`.
  - Change the sorting logic for `sport === 'golf'` to use `b.season_points - a.season_points` (as requested by user).
  - Update the render block for `sport === 'golf'` to show a 5-column layout:
    - Played: `entry.matches_played`
    - Wins: `entry.matches_won`
    - Best (Classic): `entry.best_score_classic || '-'`
    - Best (Chip): `entry.best_score_chip_off || '-'`
    - HIO: `entry.golf_lifetime_hio`

## Assumptions & Decisions
- **Decision**: The user explicitly requested to sort the combined Golf tab by Season Points.
- **Decision**: Chip Off and Classic Golf matches will both increment `matches_played` and `matches_won` under the unified Golf tab.
- **Assumption**: A Chip Off score of 10 (`ms.extra.tens`) is equivalent to a Classic Golf Hole In One (`ms.extra.hio`) for the purpose of the `golf_lifetime_hio` counter.

## Verification Steps
1. Navigate to the Leaderboards page and click the Golf tab.
2. Verify that "Baby daddy" (or any player with a Chip Off HIO) now shows a number > 0 in the HIO column.
3. Verify that the Golf tab displays all 5 requested columns: Played, Wins, Best (Classic), Best (Chip), and HIO.
4. Verify the leaderboard sorts correctly by Season Points.