# Plan: Golf Scoring Buttons & Scorecard Implementation

The goal is to fix the missing holes in the Golf Room and implement a more intuitive, seamless scoring interface with a classic scorecard layout.

## Current State Analysis
- **Hole Initialization**: The `GolfRoom` component attempts to create holes if they don't exist, but if the insertion fails, the scorecard remains empty.
- **UI State**: The user's screenshot shows an empty scorecard body (no holes) and a total par of 0, confirming the `holes` array is empty.
- **Scoring Interface**: Currently relies on a bottom sheet modal triggered by clicking an empty cell. The user wants "actual score buttons" and a functional "score card".

## Proposed Changes

### 1. Robust Hole Initialization (GolfRoom.tsx)
- **Fix `loadData`**: Improve error handling during the `insert` operation. If insertion fails, show a descriptive error or a "Retry" button.
- **Manual Fallback**: Add an "Initialize Holes" button that appears if the scorecard is empty, allowing the user to manually trigger the course setup.
- **Match Context**: Ensure `match.house_rules.course_data` is correctly utilized to prevent empty courses.

### 2. Classic Scorecard UI Enhancements (GolfRoom.tsx)
- **Interactive Cells**: Make the score cells look more like buttons with hover states and clear "Empty" indicators.
- **Horizontal Scroll**: Ensure the table handles multiple players gracefully with horizontal scrolling.
- **Hole Info**: Display the hole name (from `title`) prominently alongside the hole number.

### 3. "Always-On" Scoring Buttons (Optional/Refinement)
- **Quick Entry Row**: Consider adding a quick entry row or keeping the bottom sheet but making it more prominent.
- **Labeled Buttons**: Ensure buttons like "Par", "Birdie", "Bogey" are the primary way to enter scores, with a manual +/- as a fallback.
- **Auto-Advance**: Keep the auto-advance logic to ensure a "seamless" experience for the scorekeeper.

### 4. Implementation Details
- **File**: [GolfRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/GolfRoom.tsx)
- **Action**: 
    - Wrap the initialization logic in a more resilient way.
    - Add a loading state for the initial hole creation.
    - Update the table rendering to show a "No holes defined" message if the array is empty, with a button to fix it.

## Verification Plan
1. **Empty Match**: Open a new golf match and verify that holes are automatically created.
2. **Missing Holes**: Manually delete `golf_holes` from Supabase (if possible) and verify the "Initialize" button appears.
3. **Scoring Flow**: Test the scoring buttons (Par, Birdie, etc.) and verify they correctly record strokes and advance to the next player.
4. **Layout**: Verify the "Classic Scorecard" looks polished on mobile and desktop.
