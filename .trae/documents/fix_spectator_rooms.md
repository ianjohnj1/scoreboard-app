# Plan: Fix Spectator Rooms

## Summary
The spectator room currently fails to display the correct sport name and the correct match UI for games with variants (such as Chip Off). For example, a Chip Off spectator room shows the generic "Golf" label and renders the `GolfRoom` component instead of `ChipOffRoom`. We will fix `getSportLabel` to support sub-sport variants and update `SpectatorPage.tsx` to correctly map to variant-specific rooms (like Chip Off) and pass the variant into the header label.

## Current State Analysis
- **File**: `src/lib/matches.ts` - `getSportLabel` only checks the `sport` string (e.g., `'golf'`), returning "Golf" even if it's a Chip Off match.
- **File**: `src/pages/SpectatorPage.tsx` - `sportRooms` maps `'golf'` strictly to `GolfRoom`. It does not check `match.house_rules?.variant` to route to `ChipOffRoom`, meaning a spectator sees a generic golf scorecard instead of the live chip-off metrics.
- **Live Data**: The individual match room components (`ChipOffRoom`, `CricketRoom`, etc.) already implement robust Supabase realtime channel subscriptions (`postgres_changes`) and `isSpectator` handling. Once the correct room is rendered, the live stats and metrics will stream in automatically.

## Proposed Changes

### 1. Enhance `getSportLabel` for Sub-sports
- **File**: `src/lib/matches.ts`
- **What/How**:
  - Update the `getSportLabel` signature: `export function getSportLabel(sport: string, customName?: string | null, variant?: string | null): string`
  - Add logic to return specific labels if a `variant` is provided:
    - `'chip_off'` -> `'Chip Off'`
    - `'backyard'` -> `'Backyard Cricket'`
    - `'countdown'` -> `'Darts - 501/301'`
    - `'around_the_world'` -> `'Darts - Around the World'`
    - `'killer'` -> `'Darts - Killer'`

### 2. Fix Spectator Room Component Routing & Header
- **File**: `src/pages/SpectatorPage.tsx`
- **What/How**:
  - Import `ChipOffRoom` at the top of the file.
  - After selecting the default `SportRoom` from the `sportRooms` dictionary, add a conditional override: `if (match.sport === 'golf' && match.house_rules?.variant === 'chip_off') SportRoom = ChipOffRoom;`
  - Update the header `<h1 />` to pass the variant: `{getSportLabel(match.sport, match.custom_game_name, match.house_rules?.variant)}`

### 3. Update Match Room Header (Optional Consistency)
- **File**: `src/pages/MatchRoomPage.tsx`
- **What/How**:
  - Update the header `<h1 />` to also pass the variant to `getSportLabel` for consistency with the spectator view.

## Verification
1. Start a Chip Off match and open the Spectator URL in a new tab.
2. Verify the spectator tab header says "Chip Off" instead of "Golf".
3. Verify the spectator tab renders the `ChipOffRoom` interface (showing the live stats/metrics) rather than the standard 9-hole `GolfRoom`.
4. Score a few chips on the active match and verify the spectator tab updates in real-time.