# Plan: Backyard Cricket Batting Order Polish

## Summary
In Backyard Cricket mode, the batting order will be established automatically based on the order players join the room (`batting_order` property). When a batter is dismissed, the system will automatically loop to the next player in the rotation without checking if they have batted before. A dismissable "Next Batter" modal will be presented to confirm the transition. Additionally, `max_overs` and `max_wickets` will be hidden and removed from the setup for Backyard Cricket, as they are irrelevant for this dynamic game mode.

## Current State Analysis
1. **Match Setup (`NewMatchPage.tsx`)**: Currently displays and applies `max_overs` and `max_wickets` to Backyard mode.
2. **Dismissal Logic (`CricketRoom.tsx`)**: In `handleWicket`, backyard mode currently attempts to find the next player who has `!bat_dismissed`. This breaks if everyone has batted once because it won't be able to find a player who isn't dismissed.
3. **UI Indicators (`CricketRoom.tsx`)**: The scoreboard currently greys out players who have `bat_dismissed = true` and shows their dismissal method. If they bat again without resetting this flag, they'll look "out" while batting.

## Proposed Changes

### 1. Hide Max Overs/Wickets in Setup
- **File**: `src/pages/NewMatchPage.tsx`
- **What/How**:
  - In the `useEffect` that sets defaults for `cricketVariant === 'backyard'`, remove `max_overs` and `max_wickets`.
  - In the render block, wrap the `RuleNumber` inputs for `max_overs` and `max_wickets` with `{cricketVariant !== 'backyard' && (...) }` so they do not appear in the UI.

### 2. Auto-rotate Batters & Reset Dismissal State
- **File**: `src/components/sports/CricketRoom.tsx`
- **What/How**:
  - In `handleWicket`, update the backyard mode logic:
    - Sort `players` by `batting_order`.
    - Find the index of `currentBatter1`.
    - Set the `nextBatter1Id` to `(currentIdx + 1) % sortedPlayers.length`.
    - Clear the `bat_dismissed`, `bat_dismissal_method`, `bat_dismissed_by`, and `bat_fielded_by` properties for the newly selected batter in the `cricket_player_stats` table so they appear active.
    - Set `nextBatterProfileId` state and `showNextBatterModal` state to true.

### 3. "Next Batter" Modal
- **File**: `src/components/sports/CricketRoom.tsx`
- **What/How**:
  - Add state variables: `const [showNextBatterModal, setShowNextBatterModal] = useState(false);` and `const [nextBatterProfileId, setNextBatterProfileId] = useState<string | null>(null);`
  - Add a `<Modal>` component at the bottom of the room view that triggers when `showNextBatterModal` is true.
  - The modal will display the new batter's `Avatar` and display name with a prominent "Ready" button to dismiss it.

## Verification
1. Create a Backyard Cricket match.
2. Verify `max_overs` and `max_wickets` do not appear in the rules configuration.
3. Manually select the first batter.
4. Dismiss the batter. Verify the "Next Batter" modal appears with the next player's details.
5. Dismiss the modal and verify the next player is now batting and their score row does not show them as "out".
6. Repeat dismissals until the order loops back to the first batter, verifying infinite rotation.