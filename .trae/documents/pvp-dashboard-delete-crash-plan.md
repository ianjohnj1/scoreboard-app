## Summary

Investigate and fix the crash that occurs when deleting a **completed PvP match** from the **Dashboard card** flow. The work should focus on the dashboard delete interaction, the shared `deleteMatch()` helper, and any dashboard re-render/state transition that is specific to completed golf-family PvP matches after the deletion succeeds or partially succeeds.

## Current State Analysis

- The user has confirmed the crash happens from the **Dashboard card** delete button, not the History page.
- The affected match type is a **completed** PvP match (`sport='golf'` + `house_rules.variant='putt_vs_putt'`).
- The current shared delete implementation is in [deleteMatch](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts#L136-L170).
  - It clears `winner_team_id` / `winner_profile_id`
  - deletes related rows from `match_events`, `match_players`, `match_teams`, `cricket_innings`, `cricket_player_stats`, `golf_holes`, `golf_scores`
  - clears `active_sessions.match_id`
  - then deletes `match_rooms`
- The dashboard delete UI path is in [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx):
  - [handleDeleteMatch](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx#L63-L84) calls `deleteMatch(match.id)` and then reloads dashboard data
  - completed matches are rendered in the “Recent Matches” section via [MatchCard](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx#L314-L390)
  - the delete button inside `MatchCard` already stops click propagation before calling `onDelete()`
- The History page has its own delete handler in [HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx#L45-L60), but that is out of scope unless the root cause proves shared.

## Likely Failure Zones

### 1) Dashboard re-render after delete

- The crash is reported as a minified React runtime error, which suggests the frontend may be failing during render/reconciliation after the dashboard refresh rather than simply returning a Supabase permission error.
- Since this happens on the completed PvP path from Dashboard, investigation should prioritize:
  - the `recentMatches` refresh after deletion,
  - the `MatchCard` rendering assumptions,
  - any completed PvP-specific label / variant / room-code rendering in the recent matches section.

### 2) Partial delete leaves transient inconsistent data

- `deleteMatch()` performs multiple independent operations before the final `match_rooms` delete.
- If one of these operations fails or races with the dashboard refresh, the dashboard may briefly receive partially deleted rows.
- Completed PvP matches are team-based and winner-based, so the `winner_team_id` clearing plus team/player deletion order is especially relevant.

### 3) Golf-family / PvP data shape assumptions

- PvP uses the golf family but persists through `match_events`, `match_players`, and `match_teams`, not `golf_holes` / `golf_scores`.
- The dashboard or sport-label helpers may be assuming a shape that becomes invalid during or just after deletion of a completed PvP room.

## Proposed Changes

### 1) Reproduce the dashboard delete crash in a non-minified dev flow

**Files involved**
- [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx)
- [matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts)

**What**
- Reproduce the delete flow in development so the actual React/component stack is visible.
- Capture whether the failure occurs:
  - before `deleteMatch()` resolves,
  - during `loadDashboardData()`,
  - or during post-refresh rendering of the dashboard lists.

**Why**
- The screenshot shows a minified React invariant, which is too generic to safely patch by inspection alone.
- This bug is runtime-shaped; reproducing the real stack is necessary before implementation.

**How**
- Run the app in dev mode.
- Use the existing test login.
- Delete a completed PvP dashboard card while watching browser console + network.
- If needed, add temporary minimal instrumentation only around:
  - `handleDeleteMatch`
  - `deleteMatch`
  - dashboard list render inputs after refresh

### 2) Harden the shared delete flow against partial/unsafe refresh states

**File**
- [matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts)

**What**
- Review the deletion order and error handling for completed team-based matches.
- If the current multi-step delete can leave transient inconsistent state, make it safer.

**Why**
- Dashboard refresh immediately after delete is a likely trigger if partial state leaks into the next render.

**How**
- Verify whether the helper should:
  - await and validate each destructive step rather than ignoring per-query errors inside `Promise.all`,
  - delete children in a safer order for completed team matches,
  - or return a clearer failure before dashboard refresh proceeds.
- Prefer minimal structural change unless evidence shows the current order is the problem.

### 3) Defensively normalize dashboard recent-match rendering

**File**
- [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx)

**What**
- Audit `MatchCard` and dashboard list rendering so partially missing or stale match fields cannot crash the view.

**Why**
- Even if the root cause is data timing, the dashboard should tolerate a row disappearing or returning incomplete fields during deletion.

**How**
- Verify all rendering of:
  - `match.house_rules?.variant`
  - `match.room_code`
  - `match.match_time`
  - `match.status`
  - sport label/icon helpers
- Add targeted guards/fallbacks only where they prevent a real crash path.
- Keep the existing UX: spinner during delete, no accidental navigation, no duplicate reload loops.

### 4) Confirm History page behavior remains unaffected

**File**
- [HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx)

**What**
- After fixing the dashboard path, smoke-test the History page delete flow.

**Why**
- Both screens use the same shared `deleteMatch()` helper, so a shared fix could unintentionally affect history behavior.

**How**
- Do not proactively rewrite History unless the discovered root cause is shared.
- Only make History changes if the same guard/fix is required there.

## Assumptions & Decisions

- The plan targets the **dashboard completed PvP delete** bug specifically.
- The History page is verification scope, not primary implementation scope.
- The fix should be evidence-based rather than speculative because the current visible error is only a minified React runtime code.
- No schema/migration work is assumed yet; this looks like frontend delete/render handling unless runtime evidence proves otherwise.

## Verification Steps

### Required

- Reproduce the bug from the Dashboard using a completed PvP match.
- Apply the fix and confirm:
  - no React runtime crash,
  - the deleted card disappears cleanly,
  - dashboard remains usable after refresh.
- Run:
  - `npm run typecheck`
  - `npm run build`
- Check diagnostics on edited files.

### Manual smoke checks

- Delete a completed non-PvP match from Dashboard to confirm no regression in generic delete flow.
- Delete a match from History to confirm shared delete behavior still works.
- Verify the dashboard recent matches list still renders completed PvP matches correctly before deletion.

