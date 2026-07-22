## Summary

Fix PvP spectator UX by introducing a dedicated “broadcast” live view (read-only, high-signal scoreboard + per-player live stats), while keeping the existing interactive scorer UI and the already-fixed post-match summary breakdown.

## Current State Analysis (Repo Truth)

- PvP is implemented as a golf-family variant: `sport='golf'` + `house_rules.variant='putt_vs_putt'`.
- The PvP room UI is fully contained in [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx).
  - Completed-match summary already renders per-team + per-player match breakdown (attempts, holed, match %) and includes career % + clutch wins.
  - Live match UI for non-spectators currently shows lineup cards; spectators currently see essentially the same layout (but without interaction), not a broadcast-style panel.
- Spectator routing uses [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx) and selects `PvPRoom` when `variant === 'putt_vs_putt'`.
  - `MatchContext` includes `isTvDisplayMode: boolean` (defined in [MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx#L24-L35)), but `SpectatorPage.tsx` currently omits it in the `ctx` object (TypeScript correctness issue).

## Proposed Changes

### 1) Add a PvP “Broadcast View” for live spectator/TV mode

**File:** [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)

**Goal:** When the match is live (not completed) and the viewer is either a spectator or in TV display mode, render a broadcast-first UI instead of the “lineups” UI.

**Design rules (consistent with the app’s existing broadcast philosophy):**

- Broadcast view is enabled when:
  - `isMatchComplete === false`, AND
  - `(isSpectator || isTvDisplayMode) === true`
- Broadcast view is fully read-only (no scoring buttons, no undo, no tie-break modal).
- Broadcast view emphasizes:
  - Team score (holed putts) + attempts
  - Balls remaining in the shared pool
  - “Current turn” (team + player) when pool > 0, otherwise “Pool empty / tie-break required”
  - Per-player *live match* stats so far (attempts, holed, % holed, missed count if enabled already in the summary)
- Avoid introducing new persistence. All numbers are derived from `match_events` already loaded in `events`.

**Implementation approach:**

- Introduce a boolean:
  - `const isBroadcastView = !isMatchComplete && (isSpectator || isTvDisplayMode);`
- Reuse the existing derived stats already present:
  - `teamRuntime` (team score/attempts)
  - `matchPlayerStats` (attempts/holed per player derived from `puttAttemptEvents`)
  - `turnState` (poolRemaining, activeTeamId, activePlayerId, attempt counters)
- In the main content render block, expand the conditional from:
  - `isMatchComplete ? <Summary/> : <Lineups/>`
  - to:
    - `isMatchComplete ? <Summary/> : isBroadcastView ? <BroadcastPanel/> : <Lineups/>`
- Ensure tie-break modal does not open for spectators/TV:
  - Confirm tie-break UI only triggers for interactive scorers (already mostly enforced, but broadcast view should not render anything that suggests interaction).

**Acceptance criteria:**

- Opening `/spectate/:roomCode` during an active PvP match shows a “Live” broadcast-style panel, not the interactive lineup UI.
- No scoring controls are visible in spectator broadcast view.
- As new `putt_attempt` events arrive, the broadcast view updates in real time without route reloads.
- Completed match continues to show the existing post-match summary breakdown unchanged.

### 2) Make SpectatorPage’s `MatchContext` shape correct

**File:** [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx)

- Add the missing `isTvDisplayMode` field when creating `ctx`:
  - `isTvDisplayMode: false`

**Acceptance criteria:**

- `npm run typecheck` passes (no structural typing errors for `MatchContext`).

### 3) Post-debug cleanup (only if still present)

**Files (if present):**

- [debug-pvp-summary-loop.md](file:///c:/Users/User/Desktop/scoreboard%20app/project/debug-pvp-summary-loop.md)
- `.dbg/trae-debug-log-pvp-summary-loop.ndjson`
- `.dbg/pvp-summary-loop.env`

**Goal:** Remove debug artifacts now that the loop issue was confirmed fixed by the user, and ensure no debug instrumentation remains in `PvPRoom.tsx`.

## Verification Steps

### Automated

- Run TypeScript check:
  - `npm run typecheck`
- Run production build:
  - `npm run build`
- (Optional) Lint:
  - `npm run lint`

### Manual (Dev)

- Start `npm run dev`, open a live PvP match as a scorer:
  - Confirm normal scorer UI still works, including attempt buttons and undo.
- Open the spectator route for the same room while the match is active:
  - Confirm broadcast view layout is shown and updates live as attempts are recorded.
- Finish the match (pool reaches 0, winner set):
  - Confirm completed-match summary shows the per-player match stats breakdown and is identical for scorer and spectator routes.

## Assumptions & Decisions

- “Broadcast view” applies both to spectators and to TV display mode because both are non-interactive display contexts in the app’s UX system.
- The existing per-player post-match summary breakdown is considered complete and should not be reworked unless a new requirement is added.

