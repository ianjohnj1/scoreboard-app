# Plan: Restrict Match Deletion and Historical Stats Editing to Admins

This plan outlines the steps to restrict match deletion and historical stats editing to users with the `isAdmin` role. All other accounts will be prevented from performing these actions.

## Current State Analysis
- **Match Deletion**: Currently accessible to the match creator in `Dashboard.tsx` and to both the creator and admins in `HistoryPage.tsx`.
- **Historical Stats Editing**: Most sport-specific rooms (e.g., `GolfRoom`, `CricketRoom`, `TableTennisRoom`) restrict scoring to active matches only, but do not consistently grant admins the ability to edit after completion, or they allow everyone (non-spectators) to edit even if completed (like in `GolfRoom`).
- **Permissions**: `isAdmin` is globally available via the `useAuth` hook.

## Proposed Changes

### 1. Restrict Match Deletion to Admins Only
- **[Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx)**
    - Update the `MatchCard` component usage to pass `canDelete={isAdmin}` instead of checking `match.created_by`.
- **[HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx)**
    - Update the deletion condition `(isAdmin || match.created_by === currentUser?.id)` to just `isAdmin`.

### 2. Restrict Historical Stats Editing to Admins Only
Update all sport-specific rooms to allow scoring only if the match is `active` OR the user `isAdmin`.
- **[GolfRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/GolfRoom.tsx)**: Update the score cell `onClick` and the scoring modal to check for `(match.status !== 'completed' || isAdmin)`.
- **[CricketRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CricketRoom.tsx)**: Update the scoring interface visibility to `(match.status === 'active' || isAdmin)`.
- **[TableTennisRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/TableTennisRoom.tsx)**: Update `onClick` for points to check for `(match.status === 'active' || isAdmin)`.
- **[DartsRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/DartsRoom.tsx)**: Apply similar logic to scoring buttons.
- **[PoolRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PoolRoom.tsx)**: Apply similar logic.
- **[BasketballRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/BasketballRoom.tsx)**: Apply similar logic.
- **[CardsRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CardsRoom.tsx)**: Apply similar logic.
- **[CustomRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CustomRoom.tsx)**: Apply similar logic.

### 3. Verification & UI Polish
- **[HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx)**: Ensure the `Lock` icon logic correctly reflects that only non-admins are locked out of completed matches.
- **[MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)**: Review the "End Match" confirmation message to ensure it correctly states that only admins can unlock/edit after ending.

## Assumptions & Decisions
- **Decision**: Even the creator of a match cannot delete it once it's created, unless they are an admin. This aligns with the request "this feature to only be accessable to the admin auth account".
- **Assumption**: "Historical stats" refers to matches with `status === 'completed'`.

## Verification Steps
1. **Login as a regular user**:
   - Verify that no "Delete" (trash) icon appears on the Dashboard or History page for any matches.
   - Open a completed match and verify that scoring buttons are hidden or disabled.
2. **Login as an admin**:
   - Verify that the "Delete" icon is visible on all matches in the Dashboard and History page.
   - Open a completed match and verify that scoring buttons are visible and functional.
