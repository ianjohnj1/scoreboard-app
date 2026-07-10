# Plan: Fix Cricket Score Tray Transparency

## Summary
The scoring tray is currently transparent (using glassmorphism), but the page content does not scroll underneath it. This is because the tray and the scrollable content area are siblings in a flex column, meaning they stack on top of each other rather than overlapping. To fix this, we need to position the scoring tray absolutely at the bottom of the container, and add bottom padding to the scrollable area so that the content can still be scrolled fully into view.

## Current State Analysis
- **File**: `src/components/sports/CricketRoom.tsx`
- The main container is `<div className="flex flex-col h-full overflow-hidden bg-charcoal-950">`.
- The scrollable area is `<div className="flex-1 overflow-y-auto ... pb-4">`.
- The scoring tray is a sibling below the scrollable area. Because it's a flex layout, the scrollable area ends where the tray begins.

## Proposed Changes

### 1. Make Container Relative
- **File**: `src/components/sports/CricketRoom.tsx`
- **What/How**: Change the outermost `<div>` of the component from `className="flex flex-col h-full overflow-hidden bg-charcoal-950"` to `className="flex flex-col h-full overflow-hidden bg-charcoal-950 relative"`.

### 2. Increase Bottom Padding on Scrollable Area
- **File**: `src/components/sports/CricketRoom.tsx`
- **What/How**: Change the scrollable container's padding from `pb-4` to `pb-[200px]` to ensure users can scroll the very bottom of the content above the overlapping tray.

### 3. Absolute Position the Scoring Trays
- **File**: `src/components/sports/CricketRoom.tsx`
- **What/How**:
  - For the Completed Match tray, change `className="sticky bottom-0 ..."` to `className="absolute bottom-0 left-0 right-0 ..."`
  - For the Active Match tray, change `className="sticky bottom-0 ..."` to `className="absolute bottom-0 left-0 right-0 ..."`

## Verification
1. Open a Cricket match.
2. Scroll the page content (e.g. the bowling stats table) to the bottom.
3. Verify that the content correctly scrolls *underneath* the glassmorphic scoring tray.
4. Verify that the user can still scroll all the way down to see the final row of content above the tray (due to the added padding).