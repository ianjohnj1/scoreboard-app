# Plan: Fix Cricket Score Tray Position

## Summary
The Cricket score tray is currently being pushed below the viewport because its parent containers are expanding beyond the screen height. By adjusting the flexbox height constraints in both the Match Room layout and the Cricket Room component, the score tray will correctly remain pinned to the bottom of the viewport at all times.

## Current State Analysis
- `MatchRoomPage.tsx` uses `min-h-screen`, which allows the page to grow infinitely if its content is larger than the screen.
- `CricketRoom.tsx` uses `h-screen` (100vh). When combined with the header in `MatchRoomPage.tsx`, the total height becomes `100vh + header height`, which overflows the screen. Because `MatchRoomPage.tsx` has `min-h-screen`, it allows this overflow, causing the entire page to scroll and pushing the score tray off the bottom.

## Proposed Changes
### 1. Update MatchRoomPage Layout
- **File**: `src/pages/MatchRoomPage.tsx`
- **What**: Change `min-h-screen` to `h-[100dvh]` on the main wrapper `div` (line 287).
- **Why**: This strictly constrains the match room to the dynamic viewport height (accounting for mobile browser address bars) and prevents the outer page from scrolling. All scrolling will be correctly delegated to the inner sport room components.

### 2. Update CricketRoom Layout
- **File**: `src/components/sports/CricketRoom.tsx`
- **What**: Change `h-screen` to `h-full` on the main wrapper `div` (line 525).
- **Why**: This allows the `CricketRoom` to perfectly fill the remaining space inside `MatchRoomPage`'s `flex-1` container without artificially forcing it to be 100vh tall. The score tray will naturally sit at the bottom of this container, and the internal `flex-1 overflow-y-auto` will handle the scrolling of the match history.

## Verification
- Enter an active Cricket match.
- Scroll through the match history (innings). The history should scroll independently while the score tray remains firmly hovering at the bottom of the screen.
- Ensure the header remains visible at the top.