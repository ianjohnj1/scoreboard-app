# Plan: Make Cricket Scoring Tray Fully Transparent

## Summary
The user requested that the background of the scoring tray in the Cricket match room be completely invisible so that the page content underneath is perfectly readable. The score buttons themselves should remain exactly as they are, appearing to float directly over the scrolling content.

## Current State Analysis
- **File**: `src/components/sports/CricketRoom.tsx`
- The scoring tray containers (both active and completed states) currently use a glassmorphism style: `bg-charcoal-900/40 backdrop-blur-lg border-t border-charcoal-800 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]`.

## Proposed Changes

### 1. Remove Background, Blur, Border, and Shadow from Tray Containers
- **File**: `src/components/sports/CricketRoom.tsx`
- **What/How**:
  - Locate the active match tray container:
    `<div className="absolute bottom-0 left-0 right-0 bg-charcoal-900/40 backdrop-blur-lg border-t border-charcoal-800 py-2 px-3 safe-bottom z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">`
  - Change it to:
    `<div className="absolute bottom-0 left-0 right-0 py-2 px-3 safe-bottom z-30">`
  - Locate the completed match tray container:
    `<div className="absolute bottom-0 left-0 right-0 bg-charcoal-900/40 backdrop-blur-lg border-t border-charcoal-800 p-4 safe-bottom z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">`
  - Change it to:
    `<div className="absolute bottom-0 left-0 right-0 p-4 safe-bottom z-30">`
  - This removes all visual styling from the container wrapper itself, leaving only the flex layout properties and positioning, allowing the inner buttons to float seamlessly over the page content.

## Verification
1. Open a Cricket match.
2. Verify that there is no dark gradient, border, blur, or background color behind the scoring buttons.
3. Verify the buttons themselves remain styled as they were previously.
4. Scroll the page and confirm the text underneath is 100% legible between and around the buttons.