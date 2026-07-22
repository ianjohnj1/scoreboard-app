## Summary

Fix the crash that occurs when deleting a **completed PvP match** from the **Dashboard card** flow, using a code-first approach that avoids live browser reproduction inside Trae. The implementation should focus on the shared `deleteMatch()` helper and the Dashboard’s delete/render flow, then verify safely with strict typecheck, build, and lightweight smoke validation.

## Current State Analysis

- The failure target is now well-defined:
  - **Screen:** Dashboard
  - **Action:** Delete button on a match card
  - **Match type:** completed PvP match (`sport='golf'` + `house_rules.variant='putt_vs_putt'`)
- The shared deletion logic lives in [deleteMatch](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts#L136-L170).
  - It first clears `winner_team_id` / `winner_profile_id` on `match_rooms`
  - then runs several child-table deletions in `Promise.all(...)`
  - then deletes the parent `match_rooms` row
- The Dashboard delete wrapper is [handleDeleteMatch](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx#L63-L84), which:
  - confirms with `window.confirm`
  - sets `deletingId`
  - calls `deleteMatch(matchId)`
  - immediately reloads dashboard data with `loadDashboardData()`
- Dashboard cards are rendered by [MatchCard](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx#L314-L390).
  - The delete button already stops propagation.
  - Completed matches still show a navigation chevron and normal metadata rendering.
- The previous attempt to reproduce interactively caused the Trae session/app to restart, so the next pass should **not depend on browser automation** to make progress.

## Likely Root-Cause Areas

### 1) Partial delete state leaking into dashboard refresh

- `deleteMatch()` performs several destructive operations independently.
- Because the child deletions are grouped in `Promise.all(...)`, partial failures can be easy to miss unless every response is checked explicitly.
- Dashboard refresh runs immediately afterward, so a partially deleted completed PvP row may be re-read in an inconsistent shape.

### 2) Completed PvP rows are more sensitive than generic matches

- PvP is team-based and completed matches have `winner_team_id` semantics.
- The helper clears winner references before deleting dependent team/player/event rows.
- If that sequence briefly exposes a match with missing supporting rows but still present dashboard fields, the dashboard may re-render against a shape it was not written to tolerate.

### 3) Dashboard card rendering is not defensive enough

- `MatchCard` assumes `match` remains render-safe throughout the delete lifecycle.
- If `loadDashboardData()` returns a transient/stale/incomplete row, completed PvP-specific metadata could still flow through label/icon helpers or navigation affordances.

## Proposed Changes

### 1) Harden `deleteMatch()` so it fails cleanly and predictably

**File**
- [matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts)

**What**
- Replace the current “fire many deletes in parallel, only inspect the final parent delete error” pattern with explicit checked operations.

**Why**
- This is the most likely source of a partial-success / inconsistent-refresh bug.

**How**
- Keep the overall shape of the helper, but make it deterministic:
  - clear parent winner references,
  - execute child cleanup in a controlled order or in checked batches,
  - inspect and throw on any child-table deletion/update error immediately,
  - only delete `match_rooms` after all prerequisites succeed.
- Preserve shared behavior for non-PvP sports; do not special-case PvP unless evidence in code demands it.

### 2) Make Dashboard delete refresh resilient

**File**
- [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx)

**What**
- Tighten the delete handler and dashboard card rendering so a disappearing or partially stale row cannot crash the screen.

**Why**
- Even with a stronger shared delete helper, the dashboard should tolerate intermediate state during refresh.

**How**
- Review `handleDeleteMatch()` and `MatchCard` for assumptions around:
  - `match.status`
  - `match.room_code`
  - `match.match_time`
  - `match.house_rules?.variant`
  - `getSportLabel(...)` / `getSportIcon(...)`
- Add targeted guards/fallbacks where needed so delete completion results in:
  - spinner while deleting,
  - clean disappearance after refresh,
  - no invalid navigation/render path for the row being deleted.
- Keep the current UX intact; do not redesign the card.

### 3) Limit scope to the shared helper + dashboard unless a shared bug is obvious

**Files**
- [HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx) for verification only

**What**
- Do not proactively rewrite History page delete logic.

**Why**
- The user’s bug report is specific to Dashboard completed PvP deletion.
- History should remain a smoke-test target because it shares `deleteMatch()`.

**How**
- If the final shared helper change naturally benefits History, that is acceptable.
- Only edit History if the same unsafe assumption exists there and is required for correctness.

## Assumptions & Decisions

- The implementation should **avoid live browser reproduction inside Trae** because the last session crashed during that step.
- The first pass should be code-driven and minimal, not a broad delete-system rewrite.
- The most probable fix area is shared delete correctness plus dashboard render hardening, not PvP room code.
- No new migration/RLS work is assumed at plan time.

## Verification Steps

### Required

- Run `npm run typecheck`
- Run `npm run build`
- Run diagnostics on edited files

### Safe smoke checks

- Confirm the Dashboard delete path code no longer has unsafe partial-delete assumptions.
- Confirm a completed PvP card can be removed from Dashboard without any obvious invalid state transitions in code.
- Smoke-check that History still uses the shared helper safely after the change.

### Optional follow-up outside Trae runtime

- If needed after code changes, the user can manually verify deleting a completed PvP dashboard card in the normal app environment, avoiding another in-session browser crash loop.

