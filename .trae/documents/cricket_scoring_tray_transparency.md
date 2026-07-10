# Plan: Cricket Scoring Tray Transparency

## Summary
The user requested that the scoring tray in the Cricket match room be made transparent so that the page content underneath remains visible. To maintain legibility of the scoring buttons, we will implement a "Glassmorphism" effect by reducing the background opacity, increasing the backdrop blur, and softening the top shadow.

## Current State Analysis
- **File**: `src/components/sports/CricketRoom.tsx`
- The scoring tray is pinned to the bottom using `sticky bottom-0`.
- It currently uses `bg-charcoal-900/95` making it almost fully opaque.
- It has a medium blur (`backdrop-blur-md`) and a heavy top shadow (`shadow-[0_-10px_40px_rgba(0,0,0,0.5)]`).

## Proposed Changes

### 1. Update Scoring Tray CSS Classes
- **File**: `src/components/sports/CricketRoom.tsx`
- **What/How**:
  - Locate the two `sticky bottom-0` containers (one for the active match scoring controls, one for the completed match actions).
  - Change `bg-charcoal-900/95` to `bg-charcoal-900/40` to let the background show through.
  - Upgrade `backdrop-blur-md` to `backdrop-blur-lg` to diffuse the background enough so that the text/buttons on the tray remain perfectly legible.
  - Soften the shadow from `rgba(0,0,0,0.5)` to `rgba(0,0,0,0.2)` to reduce the heavy dark gradient cast onto the page content above it.

## Verification
1. Open a Cricket match.
2. Scroll the page so that content (like player rows or bowling stats) passes underneath the scoring tray.
3. Verify that the content is visible through the tray with a frosted glass effect.
4. Complete the match and verify the same effect applies to the Rematch/Dashboard action tray.