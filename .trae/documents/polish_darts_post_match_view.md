## Summary
Implement a polished post-match view for Darts by preserving final target/score progression, replacing the active throwing controls with a Match Summary view, and adding Rematch and Dashboard navigation actions.

## Current State Analysis
- When a match is won, `match.winner_profile_id` updates via real-time subscription or context refresh.
- The `DartsRoom` component currently lists `match.winner_profile_id` in the dependency array of its main initialization `useEffect`. This triggers `buildInitialState` upon match completion, which wipes the `state.countdown`, `state.aroundTheWorld`, and `state.killer` progress, causing the UI to reset prematurely to "Target: 1".
- The active `DartsBoard` and input buttons (Bull, D-Bull, Miss, Undo) remain visible even after `state.winner` is truthy, risking accidental inputs.
- There is no quick "Rematch" flow; users must navigate back to the main menu and rebuild the match from scratch.

## Proposed Changes

### 1. Fix State Reset on Completion (`src/components/sports/DartsRoom.tsx`)
- **What**: Remove `match.winner_profile_id` from the dependency array of the main initialization `useEffect`. Add a new, separate `useEffect` that listens for `match.winner_profile_id` changes and updates `state.winner` locally without wiping the rest of the game state.
- **Why**: Ensures that the final score/target numbers achieved during the match are preserved in the player cards and side panels.
- **How**: 
  ```typescript
  // Initialization effect (remove match.winner_profile_id)
  useEffect(() => {
    setState(buildInitialState(variant, playerIds, countdownRules, killerRules, match.winner_profile_id));
    // ...
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, match.id, ...]);

  // Sync external winner updates without resetting progression
  useEffect(() => {
    if (match.winner_profile_id && state.winner !== match.winner_profile_id) {
      setState(prev => ({ ...prev, winner: match.winner_profile_id }));
    }
  }, [match.winner_profile_id, state.winner]);
  ```

### 2. Freeze and Hide Throwing Controls & Render Match Summary (`src/components/sports/DartsRoom.tsx`)
- **What**: Conditionally render the `DartsBoard` and the four action buttons based on `!state.winner`.
- **Why**: Prevents accidental inputs post-match and cleans up the UI.
- **How**: Wrap the board and buttons in a ternary operator. If `state.winner` is truthy, render a Match Summary `<div>`.
- **Match Summary Details**:
  - Render a large success icon and a "Match Complete" header.
  - Render two core metric blocks: "Total Turns" (`state.turns.length`) and "Darts Thrown" (`state.turns.reduce(...)`).

### 3. Add Navigation Action Buttons (`src/components/sports/DartsRoom.tsx`)
- **What**: Include `[ Rematch ]` and `[ Dashboard ]` buttons inside the Match Summary view.
- **Why**: Fulfills the user's request for smooth post-match navigation and re-playability.
- **How**:
  - Import `useNavigate` from `react-router-dom` and `supabase` from `../../lib/supabase`.
  - Add a new `handleRematch` async function that:
    1. Generates a new `room_code`.
    2. Inserts a clone of the current `match_rooms` row (preserving `house_rules` and `custom_config`).
    3. Maps over `ctx.players` to insert identical rows into `match_players` for the new match.
    4. Navigates to `/match/${room_code}`.
  - The Dashboard button simply triggers `navigate('/')`. (Payload saving is already securely handled natively via `persistThrow` calling `completeMatchWithWinner`).

## Verification Steps
- Play an Around the World match to completion.
- Verify that the winner's card shows "Target: Bull" and other players' cards show their exact final targets, instead of resetting to "Target 1".
- Verify that the `DartsBoard` and scoring buttons disappear, replaced by the Match Summary metrics.
- Click "Rematch" and verify it smoothly transitions to a new active match room with the exact same mode, players, and rules.
