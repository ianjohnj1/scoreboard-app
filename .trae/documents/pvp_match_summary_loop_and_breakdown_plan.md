# Plan: Fix PvP Match Summary Loop + Add Player Breakdown + Update Spectator View

## Summary

1. Fix the PvP post-match summary experience that currently “keeps loading on a loop”.
2. Extend the PvP post-match summary to show a per-player breakdown for the match:
   - Match attempts, match holed putts, match % holed
   - Career % holed and career clutch wins (tie-break wins)
3. Ensure the spectator view reflects the same PvP live + post-match behavior (read-only), including the new summary breakdown.

## Current State Analysis (Grounded)

- PvP room: [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
  - Renders a “summary/leaderboard” surface whenever `match.status === 'completed' || match.winner_team_id || isSpectator || isTvDisplayMode`.
  - Loads events from `match_events` and career analytics from `player_career_analytics`.
  - Subscribes realtime to:
    - `match_events` filtered by match id
    - `player_career_stats` **without any filter** (global change feed)
- Match shell: [MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)
  - No dedicated “match summary page” route; summary is handled inside each sport room.
- Spectator shell: [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx)
  - Reuses the same sport rooms (including `PvPRoom`) with `isSpectator: true`.
- Your report: the loop occurs in the **PvP summary section** (not the MatchRoomPage header spinner).

## Hypotheses (Falsifiable)

1. **Summary gating bug**: PvP always forces the summary surface for spectators (and TV mode), causing a constant “summary reload” feel during live play rather than a stable live room UI.
2. **Realtime storm**: The unfiltered `player_career_stats` realtime subscription in PvP fires repeatedly (for unrelated stats writes), triggering repeated analytics fetches and re-renders that appear as “loading”.
3. **Effect feedback loop**: A PvP effect is repeatedly triggering state changes (e.g., toggling summary state, tie-break state, or calling refresh) after match completion.
4. **Data instability**: Derived arrays (`teamRuntime`, `orderedTeams`, etc.) are re-created in a way that triggers repeated subscriptions or expensive work tied to dependencies.

We will confirm/reject these with runtime evidence before changing business logic.

## Decisions (From You)

- Post-match player breakdown must include:
  - match attempts, holed, holed %
  - career % holed
  - career clutch wins
- The issue is in the PvP summary section.

## Proposed Changes

### 1) Debug + Fix the Summary “Loading Loop”

**Instrumentation (first code change during execution)**

- Add temporary debug reporting in [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx) to capture:
  - when `loadEvents()` / `loadAnalytics()` run and what they return (counts + errors)
  - when realtime callbacks fire (match_events vs player_career_stats)
  - when summary gating chooses “summary vs live” render state
  - frequency counters (so we can prove it’s a storm vs a single update)

**Expected likely fix (based on current code shape)**

- Change the summary gating condition in `PvPRoom` so spectators are not forced into the “summary” surface during live play:
  - Summary should render only when match is completed (or winner is set).
  - Spectators should see the normal live room UI (read-only), just like other sports rooms.
- Reduce/contain analytics refresh churn:
  - Remove the global `player_career_stats` realtime subscription for PvP, or
  - Replace it with a profile-scoped approach:
    - For each participant profile_id, subscribe with `filter: profile_id=eq.<id>`
    - Debounce `loadAnalytics()` so multiple writes from `updateCareerStats()` don’t cause visible churn

We will choose the minimal fix after evidence confirms which hypothesis is true.

### 2) Add PvP Post-Match Player Breakdown

- File: [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
- Add a derived `matchPlayerStats` map from `putt_attempt` events:
  - attempts: count of `putt_attempt` where `player_id === profileId`
  - holed: count of those where `outcome === 'holed'`
  - matchPctHoled: `holed/attempts*100` (0 if attempts=0)
- In the post-match summary, render a per-team section listing the players in lineup order with:
  - Match attempts, match holed, match % holed
  - Career % holed (`career_pct_holed` from `player_career_analytics`)
  - Career clutch wins (`clutch_putts` from `player_career_analytics`)
- Keep the existing team-level summary (team score/attempts) above the per-player breakdown.

### 3) Update Spectator View Behavior

- Primary behavior change is inside `PvPRoom` (because spectators reuse it):
  - Live PvP: spectators see the normal live room surface (read-only) including pool + attempt counter + current player.
  - Completed PvP: spectators see the same match-complete summary and the same per-player breakdown.
- Verify the spectator shell wiring remains correct in [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx):
  - `match.house_rules.variant === 'putt_vs_putt'` routes to `PvPRoom` already.

## Files To Touch (Expected)

- [src/components/sports/PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
- Possibly (only if needed for UX parity):
  - [src/pages/SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx)

## Verification Steps

1. Reproduce the “summary loading loop” on a completed PvP match and capture logs (pre-fix).
2. Apply the minimal fix and verify:
   - Summary is stable (no repeated fetch/re-render storm)
   - Spectator live view is stable and read-only
3. Complete a PvP match and confirm:
   - Post-match summary shows team totals and per-player breakdown
   - Career % holed and clutch wins show correctly
4. Confirm no regressions:
   - Non-PvP sports rooms unchanged
   - MatchRoomPage does not enter a full-page loading loop

