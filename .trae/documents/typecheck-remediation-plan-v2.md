## Summary

Make `npm run typecheck` pass for the full repo while keeping the current strict TypeScript settings intact. The work should prioritize low-risk mechanical cleanup first, then fix the smaller set of real typing defects in shared components, page-level contracts, and sport room logic.

## Current State Analysis

- The active typecheck command is `tsc --noEmit -p tsconfig.app.json` in [package.json](file:///c:/Users/User/Desktop/scoreboard%20app/project/package.json).
- The compiler settings in [tsconfig.app.json](file:///c:/Users/User/Desktop/scoreboard%20app/project/tsconfig.app.json) include:
  - `strict: true`
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `jsx: "react-jsx"`
- A repo scan confirmed the codebase still contains many legacy `React` default imports that are unnecessary under the automatic JSX runtime.
- The failing surface is repo-wide, not limited to one recent feature. The errors fall into a few repeatable buckets:
  - unused default `React` imports,
  - unused locals/imports/state setters,
  - stale prop/type contracts,
  - a handful of genuine typing issues in sports rooms and page models.

### Confirmed Error Buckets

1. **Automatic JSX runtime mismatch**
   - Files still import default `React` even though JSX no longer requires it.
   - This is a broad, low-risk cleanup pass across `.tsx` files.

2. **Unused symbol failures under strict settings**
   - Several files have unused icons, types, destructured values, or state setters.
   - Representative files include:
     - [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx)
     - [HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx)
     - [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)
     - [MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)
     - [ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx)

3. **Shared contract mismatches**
   - [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx) passes `maxWidth` to [Modal.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/Modal.tsx), but `ModalProps` does not currently support it.

4. **App model / UI type mismatches**
   - [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx) references `match.started_at`, while [MatchRoom](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts) does not define it.
   - [TableTennisRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/TableTennisRoom.tsx) mixes `Profile` and `MatchTeam` branches too loosely.
   - [GolfRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/GolfRoom.tsx) has a reported string-to-number cast issue.
   - [DartsRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/DartsRoom.tsx) has an unsafe access on `state.killer`.

5. **CricketRoom query/cancellation typing**
   - [CricketRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CricketRoom.tsx) uses `.abortSignal(...)` on Supabase query builders in a way that the current typings reject.
   - The file also has missing-symbol / stale usage issues that need a coordinated cleanup.

6. **Residual strict-mode inference issues**
   - [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx) still contains callback parameters inferred as `any`.

## Proposed Changes

### 1) Sweep `.tsx` files for automatic JSX runtime cleanup

**Files**
- All `.tsx` files still importing default `React`

**What / Why**
- Remove default `React` imports where they are no longer required.
- Preserve named hook imports and explicit type imports only where actually needed.
- This should eliminate a large chunk of `TS6133` failures with minimal behavioral risk.

**How**
- Convert:
  - `import React, { useState } from 'react'` -> `import { useState } from 'react'`
  - `import React from 'react'` -> remove entirely when unused
- Follow up on files that still reference `React.*` and convert those to direct type imports where appropriate.

### 2) Clean up repo-wide unused imports, locals, and setters

**Files**
- [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx)
- [HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx)
- [LeaderboardPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/LeaderboardPage.tsx)
- [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)
- [MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)
- [ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx)
- Any additional files surfaced after the first rerun

**What / Why**
- Remove dead imports, variables, and destructured fields that are no longer used.
- This keeps `noUnusedLocals` and `noUnusedParameters` intact without weakening config.

**How**
- For each unused symbol:
  - delete if clearly dead,
  - narrow destructuring if only one field is needed,
  - keep only if it will be wired into real logic during the same pass.

### 3) Fix shared component prop contracts

**Files**
- [Modal.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/Modal.tsx)
- [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx)

**What / Why**
- Add typed `maxWidth?: string` support to `Modal`.
- This matches current real usage rather than forcing page-level layout regressions.

**How**
- Extend `ModalProps`.
- Apply a default width class plus optional override to the modal content wrapper.

### 4) Align shared app types with current UI usage

**Files**
- [supabase.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts)
- [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx)
- [MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)

**What / Why**
- Resolve the `started_at` mismatch by choosing one consistent model:
  - add `started_at?: string | null` to `MatchRoom` if it is real app data,
  - or replace the UI usage with `created_at` if that is the true source of truth.
- Normalize `React.ComponentType` usages to type-only imports where needed after the React default import sweep.

### 5) Fix the sports-room typing defects

**Files**
- [CricketRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CricketRoom.tsx)
- [TableTennisRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/TableTennisRoom.tsx)
- [GolfRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/GolfRoom.tsx)
- [DartsRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/DartsRoom.tsx)

**What / Why**
- Replace CricketRoom’s unsupported `.abortSignal(...)` usage with a typed-safe stale-request guard.
- Refactor TableTennis unions so profile-only fields are accessed only after narrowing.
- Guard `state.killer` properly in Darts.
- Correct Golf’s reported cast issue with explicit coercion or stronger local typing.

### 6) Fix residual strict-mode issues after the main pass

**Files**
- [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)
- Any files surfaced by the next `typecheck` run

**What / Why**
- Add explicit parameter types where inference currently falls back to `any`.
- Resolve any smaller leftover strict-null or union issues exposed after the broader cleanup.

## Execution Order

1. JSX-runtime import cleanup
2. Unused-symbol cleanup
3. Shared component contract fixes
4. Shared model/type alignment
5. Sports-room typing fixes
6. Rerun `npm run typecheck`
7. Fix any residual errors
8. Run `npm run build`
9. Run diagnostics on recently edited files

## Assumptions & Decisions

- The target outcome is a fully green repo-wide `npm run typecheck`.
- TypeScript strictness remains unchanged.
- Shared component/type changes are acceptable where they reflect existing app usage.
- Avoid `any`, `@ts-ignore`, or config weakening unless there is a proven external typing limitation with no clean alternative.

## Verification Steps

- Run `npm run typecheck` until clean.
- Run `npm run build` after typecheck passes.
- Use diagnostics on edited files to catch editor-reported issues.
- Manually sanity-check at least:
  - Profile comparison modal
  - Spectator page header/date rendering
  - Cricket / Table Tennis / PvP room entry surfaces

