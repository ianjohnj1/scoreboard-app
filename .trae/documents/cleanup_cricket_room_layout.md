# Plan: Reorganize Cricket Match Room Layout

This plan details the reorganization of the `CricketRoom.tsx` component to create a clear, stack-based layout separating batting and bowling statistics, as requested by the user.

## Current State Analysis
- The `CricketRoom.tsx` component has all stats (batting and bowling) mixed in a single column.
- Active player tickers (Striker, Non-Striker, Bowler) are in a 3-column grid.
- It is not immediately obvious where batting stats end and bowling stats begin.

## Proposed Changes

### 1. Component Structure Reorganization (`src/components/sports/CricketRoom.tsx`)
We will reorganize the JSX into three distinct "Stacks":

#### **Stack 1: Batting Summary & Stats (Top)**
- **Header Ticker**: Maintain the existing broadcast-style header (Score, Overs, CRR, Recent Balls).
- **Active Batters**: A 2-column grid showing the Striker and Non-Striker `ActivePlayerOverlay`.
- **Full Scorecard**: The `battingPlayers` list showing all runs/balls/SR.

#### **Stack 2: Scoring Controls (Middle)**
- **Controls Block**: Move the run buttons, extra buttons, and wicket button here. 
- This section will act as a divider between batting and bowling.

#### **Stack 3: Bowling Stats (Bottom)**
- **Section Header**: "BOWLING ANALYSIS" header to clearly mark the start.
- **Active Bowler**: A full-width `ActivePlayerOverlay` for the current bowler.
- **Bowling Table**: The `bowlingPlayers` list showing overs, runs, wickets, and economy.

### 2. Layout & UI Refinement
- Update the main container to use `overflow-y-auto` to ensure all stacks are accessible.
- Use distinct background shades or subtle borders to separate the stacks.
- Adjust the `ActivePlayerOverlay` grid layout:
  - Batters: `grid-cols-2`
  - Bowler: Full width (`w-full`)

## Verification Steps
1. **Visual Check**: Open the match room in the browser and verify the sequence (Batting -> Controls -> Bowling).
2. **Responsiveness**: Check that the 2-column batter grid and full-width bowler ticker look good on mobile and desktop.
3. **Functionality**: Record a few deliveries and a wicket to ensure the logic still works correctly after the move.
