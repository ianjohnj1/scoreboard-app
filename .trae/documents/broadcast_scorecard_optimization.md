# Plan: Professional Broadcast Style Cricket Scorecard

The user wants to adapt the cricket match room UI to look like a professional broadcast scorecard. This involves optimizing the layout, adding real-time stats (SR, Econ), displaying recent ball history, and improving the overall visual fidelity to mimic TV sports overlays.

## Current State Analysis
- `CricketRoom.tsx` has a basic broadcast-style header but lacks depth.
- Stats like Strike Rate (SR) and Economy (Econ) are calculated but not prominently displayed for active players.
- There is no visual representation of the current over's history (recent balls).
- The `match_events` table exists and records every delivery, which can be leveraged for the ball history.

## Proposed Changes

### 1. Fetch and Display Recent Ball History
- Update `CricketRoom.tsx` to fetch the last 6-12 `delivery` or `wicket` events from the `match_events` table for the current match.
- Create a `RecentBalls` component to display these as small circles/badges (e.g., [0], [4], [W], [1wd]) in the header or just below it.

### 2. Redesign the Broadcast Header (Score Bar)
- **Visuals**: Use a more polished, gradient-heavy design with sharp borders and "glassmorphism" effects.
- **Layout**:
  - Left: Team Name & Score (Large).
  - Center: Over History (Small badges) and Partnership info.
  - Right: Overs & CRR/RRR.

### 3. Professional Stats Overlay for Active Players
- **Batter Card**:
  - Show Runs, Balls, 4s, 6s, and Strike Rate (SR).
  - Add a "Facing" indicator (pulsing dot).
- **Bowler Card**:
  - Show Overs, Maidens, Runs, Wickets, and Economy (Econ).
  - Display the bowler's current over figures specifically.

### 4. Partnership Tracking
- Calculate the current partnership (runs scored since the last wicket fell).
- Display this in the header or near the batters' section.

### 5. Styling Enhancements
- Use a dedicated `BroadcastText` component or style for monospaced numbers.
- Add "flash" animations when the score changes.
- Improve the `LiveTicker` component to be more compact and data-rich.

## Implementation Steps

### Phase 1: Data Enrichment
- Add a `useMatchEvents` hook or logic in `CricketRoom.tsx` to subscribe to `match_events`.
- Calculate partnership runs and current bowler's over-specific stats.

### Phase 2: UI Overhaul
- Update the top score bar to include recent balls and partnership.
- Redesign the `LiveTicker` (now `ActivePlayerOverlay`) to show SR, Econ, and boundaries.
- Refine the color palette to be more "broadcast" (e.g., using `emerald-500` for active, `danger-500` for wickets).

### Phase 3: Visual Polish
- Add micro-animations (transitions, pulses).
- Ensure mobile responsiveness for the more complex layout.

## Verification Steps
- **Manual Testing**:
  - Record several balls and verify they appear in the "Recent Balls" history.
  - Verify Strike Rate updates correctly after each ball.
  - Verify Economy updates correctly for the bowler.
  - Check that the partnership resets after a wicket.
- **Visual Check**:
  - Use `OpenPreview` to ensure the layout looks "professional" and matches the vibe of a sports broadcast.
