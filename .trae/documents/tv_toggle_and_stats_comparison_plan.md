# TV Display Toggle and Player Stats Comparison Plan

Implement two frontend enhancements to improve the scoreboard experience for spectators and provide deep performance insights for players.

## 1. TV Display Mode (Foolproof Toggle)

### Objective
Add a toggle to scoring rooms that hides scoring controls for a clean "broadcast" view, while providing an easy way to restore them.

### Changes
- **MatchRoomPage.tsx**:
  - Add `isTvDisplayMode` boolean state (default: `false`).
  - Add `isTvDisplayMode` to `MatchContext` type and object.
  - Render a floating, pulsing badge when `isTvDisplayMode` is true:
    - Text: "📺 TV Mode Active — Click to Show Scoring Buttons"
    - Style: Fixed position, high z-index, pulsing animation.
    - Behavior: Click to set `isTvDisplayMode` to `false`.
  - Add a toggle button in the match options menu to enable TV Mode.
- **Sport Rooms (CricketRoom, GolfRoom, ChipOffRoom, etc.)**:
  - Update components to hide viewport-pinned bottom scoring trays/buttons when `ctx.isTvDisplayMode` is true.

### Verification
- Open a match as a host.
- Enable "TV Display Mode" from the options menu.
- Verify that scoring buttons disappear.
- Verify that the "TV Mode Active" badge appears and pulses.
- Click the badge and verify that scoring buttons reappear.

## 2. Player Stats Comparison Tool

### Objective
Allow logged-in users to compare their career stats side-by-side with another player on the profile page.

### Changes
- **ProfilePage.tsx**:
  - Add a "Compare Stats" button next to the profile card when `!isOwnProfile`.
  - Fetch the current user's career stats (`player_career_analytics`) when the "Compare" button is clicked.
  - Implement a `ComparisonModal` that displays:
    - Side-by-side comparison of common sports (Cricket, Chip Off, etc.).
    - Metrics: Strike Rate, Economy, Scoring Efficiency, Win Rate, etc.
    - Clean table or grid layout for easy comparison.

### Verification
- Log in and navigate to another user's profile.
- Click the "Compare Stats" button.
- Verify that a modal opens showing your stats next to their stats.
- Check that the data matches what is shown on individual profiles.

## Technical Details
- **Animations**: Use Tailwind's `animate-pulse` or a custom CSS keyframe for the TV Mode badge.
- **Data Fetching**: Reuse the existing `player_career_analytics` fetching logic in `ProfilePage.tsx` for the current user's stats.
- **State Management**: Use local React state for `isTvDisplayMode` in `MatchRoomPage.tsx`.
