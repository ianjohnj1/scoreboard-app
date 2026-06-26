# Plan: Golf Scoring Optimization & Custom Course Creator

Analyze, adapt, and optimize the golf scoring engine and room to support custom course definitions (like the Pizza Putt template) and provide a seamless, classic scorecard experience.

## Current State Analysis
- **Hole Management**: Holes are dynamically generated in `GolfRoom` if they don't exist, defaulting to 18 holes with Par 4.
- **Database Schema**: `golf_holes` table only tracks `hole_number` and `par`. It lacks a field for hole names/titles.
- **UI**: A standard table layout with players as columns. Scoring is done via a bottom sheet with relative delta buttons (+1, -1, etc.) and a manual stepper.
- **Match Setup**: No specific configuration for golf in `NewMatchPage`; it defaults to 18 holes.

## Proposed Changes

### 1. Database & Types
- **SQL Migration**: Add `title` column (TEXT) to the `golf_holes` table.
- **Supabase Types**: Update [supabase.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts) to include `title` in `GolfHole` type.

### 2. Match Setup (NewMatchPage)
- **Golf Configuration Step**: Add a specialized UI in [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx) when Golf is selected.
- **Course Editor**: 
    - Input for "Number of Holes".
    - A list of holes where users can name each hole (e.g., "The Bears Den") and set its par.
- **Presets**: Add a "Load Pizza Putt" button that pre-fills 11 holes with the names and pars from the provided template.
- **Storage**: Save the hole definitions array in `match_rooms.house_rules.course_data`.

### 3. Golf Room UI (Classic Scorecard)
- **Scorecard Layout**: Redesign the table in [GolfRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/GolfRoom.tsx) to match a physical scorecard:
    - **Row 1**: "Hole" (Number + Name).
    - **Row 2**: "Par".
    - **Following Rows**: Player scores.
    - *Note: This layout is better for mobile when there are many players, but if there are many holes, horizontal scrolling is needed. We will ensure a polished "Scorecard" look.*
- **Initialization**: Update `loadData` to use `house_rules.course_data` when creating holes in the database for the first time.

### 4. Optimized Scoring Engine
- **Named Scoring Buttons**: In the score input sheet, replace/augment the delta buttons with explicit labels:
    - **HOLE IN ONE** (Sets strokes to 1, sets `is_hole_in_one` to true)
    - **Eagle** (Par - 2)
    - **Birdie** (Par - 1)
    - **Par** (Par)
    - **Bogey** (Par + 1)
    - **Double Bogey** (Par + 2)
- **Seamless Control**:
    - Add "Next Player" and "Next Hole" buttons inside the scoring sheet to allow the scorer to enter all scores for a hole or all scores for a player without closing the modal.
    - Implement a "Quick Tap" mode where selecting a labeled button automatically saves and advances to the next player.

## Verification Plan
1. **Match Creation**: Create a new Golf match using the "Pizza Putt" preset. Verify that 11 holes are created with correct names and pars.
2. **Scorecard View**: Open the Match Room and verify the table displays hole names and pars correctly.
3. **Scoring**: Open the scoring sheet and test the new labeled buttons. Verify that "Birdie" on a Par 3 correctly records 2 strokes.
4. **Flow**: Test the "Next Player" navigation to ensure a smooth scoring experience for a group.
5. **Database**: Verify that `golf_holes` records in Supabase now contain the `title` data.
