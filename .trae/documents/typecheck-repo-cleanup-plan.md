## Summary

Restore a clean `npm run typecheck` result for the full repo without relaxing TypeScript strictness. The work should preserve `strict`, `noUnusedLocals`, and `noUnusedParameters`, and fix the code in two passes: low-risk mechanical cleanup first, then targeted type/API corrections in the smaller set of files with real typing defects.

## Current State Analysis

- The repo’s typecheck script is `tsc --noEmit -p tsconfig.app.json` in [package.json](file:///c:/Users/User/Desktop/scoreboard%20app/project/package.json).
- TypeScript is configured in [tsconfig.app.json](file:///c:/Users/User/Desktop/scoreboard%20app/project/tsconfig.app.json) with:
  - `strict: true`
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `jsx: "react-jsx"`
- Because the project uses the React 18 automatic JSX runtime, many files still importing default `React` now fail with `TS6133` unused-import errors. A targeted grep shows 33 `.tsx` files still start with `import React ...`.
- The remaining failures are not one root cause; they are a mix of:
  - unused imports / state setters / locals,
  - stale component API usage,
  - missing or mismatched app types,
  - a few real typing issues in sports room logic.

### Error Buckets Confirmed From Current Repo State

1. **Automatic JSX runtime cleanup**
   - Representative files:
     - [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
     - [ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx)
     - [MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)
     - [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx)
   - Likely change: remove default `React` import where only hooks/types are used, or remove the import entirely when nothing from `react` is referenced.

2. **Repo-wide unused locals / parameters**
   - Representative files surfaced by the current typecheck output:
     - [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx) (`setTopStats`)
     - [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx) (`setCustomIsTeam`, `setCustomWinCondition`, `setCustomButtons`, `addingGuest`, `loading`)
     - [MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx) (`isBackyard`)
     - [ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx) (`GolfHole`, `ChevronRight`, `isAdmin`)
     - [HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx) (unused imports/types/currentUser)
   - These are mostly safe deletions/renames once each symbol is verified unused.

3. **Component/API mismatch**
   - [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx#L692-L697) passes `maxWidth` into [Modal.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/Modal.tsx), but `ModalProps` does not define that prop.
   - This needs a deliberate decision in code:
     - either extend `Modal` to support `maxWidth`,
     - or remove the unsupported prop and keep default modal sizing.
   - Because the call site is already intentional, the safer repo-wide choice is to add typed support in `Modal` rather than silently dropping layout intent.

4. **Domain type mismatches**
   - [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx#L144-L146) reads `match.started_at`, but [MatchRoom](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts#L43-L59) does not include that field.
   - [TableTennisRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/TableTennisRoom.tsx) mixes `Profile | MatchTeam` values and then accesses profile-only props before narrowing.
   - [GolfRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/GolfRoom.tsx) contains a suspicious string-to-number cast reported by typecheck.
   - [DartsRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/DartsRoom.tsx) accesses possibly undefined `state.killer`.

5. **CricketRoom async builder typing issues**
   - [CricketRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CricketRoom.tsx#L54-L128) uses `.abortSignal(signal)` on Supabase query builders and also passes `AbortSignal | undefined` to APIs expecting `AbortSignal`.
   - Current failures indicate the query builder typing in this repo/toolchain does not expose `.abortSignal(...)` as used here.
   - The plan must replace this with a typed-safe cancellation pattern rather than suppressing errors.
   - The same file also has a real missing-symbol issue around `navigate`.

6. **Implicit-any cleanup**
   - [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx) still has at least two callback parameters inferred as `any` near the late-file player ordering logic.

## Proposed Changes

### 1) Mechanical JSX-runtime cleanup across the repo

**Files:** all `.tsx` files currently importing default `React`

**What**
- Remove `React` default imports where the automatic JSX runtime makes them unnecessary.
- Convert to named imports only where hooks are actually used.
- Leave `React.ReactNode` sites alone only if they still rely on the namespace; otherwise convert those types to direct imports if useful.

**Why**
- This is the single broadest low-risk source of `TS6133` failures.
- It aligns the codebase with the existing `jsx: "react-jsx"` compiler setting.

**How**
- Sweep the 33 identified files first.
- For each file:
  - `import React, { useState } from 'react'` -> `import { useState } from 'react'`
  - `import React from 'react'` -> remove entirely if unused
  - preserve any genuinely used named hooks/types

### 2) Remove or normalize unused imports, locals, and setters

**Files**
- [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx)
- [HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx)
- [LeaderboardPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/LeaderboardPage.tsx)
- [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)
- [MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)
- [ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx)
- [CricketRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CricketRoom.tsx)
- any additional files surfaced after the first cleanup pass

**What**
- Delete unused imports/types/icons.
- Remove dead state setters/locals where the state is no longer part of the UI.
- If a value is intentionally reserved for future work but currently unused, prefer deleting it rather than weakening compiler settings.

**Why**
- This keeps strictness intact and reduces noise before addressing the true type mismatches.

**How**
- Treat each unused symbol as one of three cases:
  - clearly dead -> delete it,
  - still needed but destructured too broadly -> narrow the destructure,
  - needed soon in the same file -> refactor references so it is genuinely used

### 3) Fix stale component prop contracts

**Files**
- [Modal.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/Modal.tsx)
- [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx)

**What**
- Add an optional `maxWidth?: string` prop to `ModalProps` and thread it into the modal content container class list.

**Why**
- `ProfilePage` already depends on wider modal sizing for the comparison UI; the type error reveals a missing shared component contract, not just a bad call site.

**How**
- Extend `ModalProps`.
- Apply the class to the inner modal wrapper with a sensible default matching current behavior.
- Verify that existing modal callers remain unchanged.

### 4) Align app data types with real usage

**Files**
- [supabase.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts)
- [SpectatorPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/SpectatorPage.tsx)
- [TableTennisRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/TableTennisRoom.tsx)
- [GolfRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/GolfRoom.tsx)
- [DartsRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/DartsRoom.tsx)

**What**
- Decide whether `MatchRoom` should include `started_at`:
  - if the field exists in live payloads and is part of repo usage, add it to the type as `string | null`;
  - if not, change the UI to rely on `created_at`.
- Refactor `TableTennisRoom` so profile-only props are accessed only after explicit narrowing or by separate typed variables for team vs player mode.
- Correct the suspicious numeric cast in `GolfRoom`.
- Guard or narrow `state.killer` in `DartsRoom`.

**Why**
- These are the smaller set of errors that reflect actual type mismatches rather than simple hygiene issues.

**How**
- Prefer strengthening local types and narrowing logic rather than adding `as any`.
- Only expand shared types like `MatchRoom` where the field is genuinely part of app reality.

### 5) Replace the unsupported CricketRoom cancellation pattern with a typed-safe one

**File:** [CricketRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/CricketRoom.tsx)

**What**
- Remove the current `.abortSignal(signal)` query-builder chaining if it is not supported by the installed Supabase typings.
- Replace it with a safe request freshness pattern, such as:
  - incrementing request tokens / sequence refs, or
  - local “ignore stale response” checks using refs plus `isMountedRef`
- Restore any missing `navigate` usage/import consistency at the same time.

**Why**
- This file contains the highest concentration of genuine type failures.
- The current cancellation approach is not compatible with the typed API surface the repo is compiling against.

**How**
- Preserve the original behavior goal: prevent stale async responses from overwriting newer state.
- Implement one consistent guard pattern throughout `loadRecentEvents`, `loadInnings`, and any dependent async branches.
- Avoid broad try/catch suppression or type assertions that hide the underlying mismatch.

### 6) Fix remaining strict-mode inference issues

**Files**
- [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)
- any follow-up files surfaced by rerunning typecheck after the major buckets above

**What**
- Add missing explicit parameter types where callbacks currently infer `any`.
- Resolve any final strict-null or union issues exposed after the earlier cleanup.

**Why**
- These are typically the last blockers once unused/dead code is removed.

**How**
- Use existing domain types from [supabase.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts) rather than inventing duplicate inline shapes where possible.

## Execution Order

1. Remove default `React` imports repo-wide.
2. Clear repo-wide unused imports/locals/state setters.
3. Fix shared component contract mismatch (`Modal` / `ProfilePage`).
4. Fix shared data type mismatches (`MatchRoom`, `TableTennisRoom`, `GolfRoom`, `DartsRoom`).
5. Refactor `CricketRoom` async typing/cancellation safely.
6. Rerun typecheck, then fix any newly exposed residual errors.
7. Run build after typecheck is green.

## Assumptions & Decisions

- The goal is a fully green repo-wide `npm run typecheck`, even though many failures are outside the most recently edited PvP files.
- Compiler strictness remains unchanged; success comes from code cleanup, not tsconfig relaxation.
- Shared component and shared type fixes are allowed when they are the cleanest path to a green repo.
- Avoid `any`, `// @ts-ignore`, or other suppression-based fixes unless a library typing defect is proven and no safe alternative exists.

## Verification Steps

### Required

- Run `npm run typecheck` until it exits cleanly.
- Run `npm run build` after typecheck passes.
- Run `GetDiagnostics` on recently edited files to catch editor-level issues.

### Manual sanity checks after build

- Open the profile comparison modal to confirm the widened modal still renders correctly.
- Open a live spectator route to confirm the header date/render still behaves after the `MatchRoom`/`SpectatorPage` type fix.
- Open Cricket, Table Tennis, and PvP routes to confirm the type fixes did not regress runtime behavior in recently active match surfaces.

