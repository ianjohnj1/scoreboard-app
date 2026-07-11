# Plan: Update Spectator Rooms for Darts, Cricket, and Golf

## Summary
Update the spectator rooms for Darts, Cricket, and Golf to provide a rich "Live Broadcast" experience, matching the intent established in the Chip Off room. For Darts, this involves exposing the detailed post-match stats grid alongside the active dartboard for spectators. For Cricket and Golf, which already display full live scorecards, we will add clear "Live Broadcast" / "Live Leaderboard" branding to enhance the spectator viewing experience.

## Current State Analysis
1. **Darts (`DartsRoom.tsx`)**: 
   - The detailed stats grid (Darts Thrown, 3-Dart Avg, First 9 Avg, Lives, etc.) is currently locked inside the `state.winner ? ...` conditional block.
   - Spectators see the live dartboard and right-hand trackers, but miss out on the advanced analytical grid until the match ends.
2. **Cricket (`CricketRoom.tsx`)**: 
   - The full Batting Scorecard and Bowling Analysis are already perfectly visible to spectators. 
   - The active scoring tray is correctly hidden. 
   - There is no specific "Live Broadcast" heading to distinguish the spectator view.
3. **Golf (`GolfRoom.tsx`)**: 
   - The interactive scorecard table is already perfectly visible.
   - The manual score entry sheet is correctly hidden for spectators.
   - There is no specific "Live Leaderboard" heading.

## Proposed Changes

### 1. `src/components/sports/DartsRoom.tsx`
- **What**: Extract the match stats grid and render it live for spectators below the dartboard.
- **How**: 
  - Create a local helper `renderStatsGrid()` containing the `matchStats.map(...)` block (lines 487-541).
  - Inside the `state.winner` true branch, replace the existing grid code with `{renderStatsGrid()}`.
  - Inside the `state.winner` false branch (the active match), add a condition at the bottom:
    ```tsx
    {(isSpectator || isTvDisplayMode) && (
      <div className="mt-8 border-t border-charcoal-700 pt-6">
        <h2 className="text-xl font-black text-charcoal-50 mb-4 text-center uppercase tracking-wide">Live Leaderboard</h2>
        {renderStatsGrid()}
      </div>
    )}
    ```

### 2. `src/components/sports/CricketRoom.tsx`
- **What**: Add a "Live Broadcast" header above the Batting Scorecard for spectators.
- **How**:
  - Locate the ` {/* Full Batting Scorecard */}` block (around line 856).
  - Inject the header immediately inside the container if the user is a spectator and the match is active:
    ```tsx
    {(isSpectator || isTvDisplayMode) && match.status !== 'completed' && (
      <div className="mb-4 flex flex-col items-center justify-center py-4 bg-charcoal-900/30 rounded-2xl border border-charcoal-700">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-danger-500 animate-pulse" />
          <h2 className="text-lg font-black text-charcoal-50 tracking-wide uppercase">Live Broadcast</h2>
        </div>
      </div>
    )}
    ```

### 3. `src/components/sports/GolfRoom.tsx`
- **What**: Add a "Live Leaderboard" header above the scorecard table for spectators.
- **How**:
  - Locate the `table` rendering block (around line 289).
  - Inject the header above the table if the user is a spectator and the match is active:
    ```tsx
    {(isSpectator || isTvDisplayMode) && match.status !== 'completed' && holes.length > 0 && (
      <div className="p-4 pb-0">
        <div className="flex flex-col items-center justify-center py-4 bg-charcoal-800/30 rounded-2xl border border-charcoal-700">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-danger-500 animate-pulse" />
            <h2 className="text-lg font-black text-charcoal-50 tracking-wide uppercase">Live Leaderboard</h2>
          </div>
        </div>
      </div>
    )}
    ```

## Verification Steps
1. Open a Darts match as a spectator and verify the dartboard is visible AND the advanced stats grid appears below it with live updates.
2. Open a Cricket match as a spectator and verify the "Live Broadcast" header appears above the scorecard.
3. Open a Golf match as a spectator and verify the "Live Leaderboard" header appears above the scorecard table.
4. Ensure none of these headers appear for active players during the match.