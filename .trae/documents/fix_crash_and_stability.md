# Plan: Fix Crash and Stability Issues During Match Deletion

The user reported that the app crashed after deleting a few matches. This investigation focuses on improving the stability of the match deletion flow and adding defensive checks to prevent runtime crashes.

## Current State Analysis
- `deleteMatch` in `src/lib/matches.ts` manually deletes related records from some tables but is missing others (`golf_holes`, `golf_scores`).
- Foreign key constraints on missing tables might cause the `match_rooms` deletion to fail.
- `Dashboard.tsx` and `HistoryPage.tsx` lack some defensive checks when mapping over match lists.
- Rapid deletions or state updates might trigger race conditions or inconsistent local states.

## Proposed Changes

### 1. Improve Deletion Logic (`src/lib/matches.ts`)
- Update `deleteMatch` to include all related tables: `golf_holes`, `golf_scores`, and `active_sessions`.
- Use `update` to clear `match_id` in `active_sessions` instead of deleting the session.
- Add better error reporting in the `deleteMatch` function itself.

### 2. Defensive Rendering in UI Components
- **`src/pages/Dashboard.tsx`**:
  - Add `if (!match) return null;` in `activeMatches.map` and `recentMatches.map`.
  - Ensure `MatchCard` handles missing properties safely.
- **`src/pages/HistoryPage.tsx`**:
  - Add `if (!match) return null;` in the match list map.
  - Use optional chaining when accessing `match.status`.
  - Memoize the `load` function with `useCallback`.

### 3. Improve `MatchCard` Component
- Add safety checks for `match.room_code`, `match.sport`, and `match.created_at`.
- Prevent navigation if the match is currently being deleted.

### 4. Verify and Clean Up Realtime Subscriptions
- Ensure subscriptions in `MatchRoomPage` and `CricketRoom` are properly cleaned up.
- Add checks to ensure callbacks don't execute if the component is unmounted or the match is gone.

## Verification Steps
- **Unit Testing**: Simulate deletions and verify that all related records are gone.
- **Manual Testing**: 
  - Delete multiple matches in rapid succession from the Dashboard.
  - Delete matches of different sports (Cricket, Golf, etc.) to ensure all related tables are covered.
  - Verify that the app doesn't crash if a match is deleted while viewing its room.
- **UI Verification**: Use `OpenPreview` to check that the Dashboard and History pages remain stable after multiple deletions.
