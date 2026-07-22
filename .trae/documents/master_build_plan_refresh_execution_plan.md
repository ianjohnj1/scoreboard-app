# Master Build Plan Refresh Execution Plan

## Summary

Refresh and finalize the code-backed master plan using the live repository as the source of truth. The main deliverable is a verified `master_build_plan.md` that accurately documents current shared infrastructure, confirmed integration points, known architecture mismatches, and future-feature blockers without assuming missing components or schema already exist.

## Current State Analysis

- `c:\Users\User\Desktop\scoreboard app\project\.trae\documents\master_build_plan.md` already contains a near-complete reconciled version of the requested master build plan and matches the supplied draft closely.
- `src/pages/NewMatchPage.tsx` is the real setup shell and confirms:
  - sport -> variant -> config -> players flow
  - `house_rules.variant` drives cricket, golf, and darts variants
  - `custom_config.buttons` is written for custom matches
  - secure UUID-derived room codes are used for initial match creation
  - cricket creation seeds `cricket_innings`
- `src/pages/MatchRoomPage.tsx` and `src/pages/SpectatorPage.tsx` are the real scorer/spectator entry points and confirm:
  - match/team/player loading flows through `getMatchByCode()`, `getMatchTeams()`, and `getMatchPlayers()`
  - sport-room dispatch is centralized in `getSportRoom()` for scorer mode and in the `sportRooms` map plus Chip Off override for spectator mode
  - scorer mode updates `active_sessions.match_id`
- `src/lib/stats.ts`, `src/lib/matches.ts`, `src/lib/supabase.ts`, and `src/contexts/AuthContext.tsx` confirm:
  - `SEASON_POINT_RULES` is the season-points source of truth
  - completion flows call `updateCareerStats()`
  - leaderboard data flows through `getGlobalLeaderboardData()`
  - `x-session-id` is injected in Supabase requests
  - auth/session lifecycle is owned by `AuthContext.tsx`
- `supabase/migrations/20260722_security_audit_rls.sql` confirms the authoritative RLS helpers and policies, including `get_current_session_profile_id()` and `is_match_participant()`.
- The documented gaps are real:
  - no shared `InfoTooltip`
  - no shared `TeamVsTeamLayout`
  - no shared comments schema in `supabase/migrations`
  - no upcoming-events route or schema
- The documented runtime caveats are also real:
  - `CricketRoom.tsx`, `GolfRoom.tsx`, and `ChipOffRoom.tsx` hydrate from persisted tables/events and subscribe to realtime
  - `DartsRoom.tsx` records events but keeps live engine state in component memory instead of rebuilding from persisted events
  - `TableTennisRoom.tsx`, `PoolRoom.tsx`, `BasketballRoom.tsx`, `CardsRoom.tsx`, and `CustomRoom.tsx` remain local-state-first
- One important architecture mismatch remains confirmed:
  - `NewMatchPage.tsx` writes `custom_config.buttons`
  - `CustomRoom.tsx` reads `custom_config.scoring_buttons`
- One important security/shareability caveat remains confirmed:
  - `NewMatchPage.tsx` uses UUID-derived room codes
  - rematches in `CricketRoom.tsx`, `DartsRoom.tsx`, and `ChipOffRoom.tsx` still use 5-character `Math.random()` codes

## Proposed Changes

### 1. Finalize the master plan document

- File: `c:\Users\User\Desktop\scoreboard app\project\.trae\documents\master_build_plan.md`
- What:
  - Re-read the document against the latest repo state.
  - Preserve the current reconciled structure because it already matches the requested master plan well.
  - Apply only targeted wording or factual corrections if any drift is found during the final audit.
  - Keep the verification checklist at the end so future specs can use it as a gate.
- Why:
  - This is the main artifact future planning will depend on.
  - It already reflects most of the live architecture, so the safest path is to refine rather than rewrite.
- How:
  - Cross-check each section against the confirmed files and symbols.
  - Update only claims that are stale, incomplete, or insufficiently explicit.
  - Avoid introducing aspirational infrastructure unless it is clearly labeled as missing or future-state.

### 2. Refresh the reconciliation spec only if it has drifted

- Files:
  - `c:\Users\User\Desktop\scoreboard app\project\.trae\specs\reconcile-master-build-plan\spec.md`
  - `c:\Users\User\Desktop\scoreboard app\project\.trae\specs\reconcile-master-build-plan\tasks.md`
  - `c:\Users\User\Desktop\scoreboard app\project\.trae\specs\reconcile-master-build-plan\checklist.md`
- What:
  - Verify the existing spec package still matches the finalized `master_build_plan.md`.
  - Only patch these files if the final master plan introduces clarifications not yet reflected in the spec package.
- Why:
  - The repo already includes a reconciliation spec, and future planning work may rely on it.
  - Keeping the spec package aligned prevents later feature specs from reintroducing stale assumptions.
- How:
  - Compare requirements and task wording with the finalized master plan.
  - Add only minimal updates for any newly clarified blockers, terminology, or integration notes.

### 3. Do not change application code as part of this task unless the user expands scope

- Files intentionally not targeted for edits in this pass:
  - `src/pages/NewMatchPage.tsx`
  - `src/pages/MatchRoomPage.tsx`
  - `src/pages/SpectatorPage.tsx`
  - `src/lib/stats.ts`
  - `src/lib/matches.ts`
  - `src/lib/supabase.ts`
  - `src/contexts/AuthContext.tsx`
  - `src/components/sports/*`
  - `supabase/migrations/*`
- What:
  - Treat these files as audit sources, not implementation targets, for this plan.
- Why:
  - The request is to produce a code-backed master plan, not to fix the runtime gaps documented by that plan.
  - Mixing documentation reconciliation with feature/security implementation would blur scope and make validation harder.
- How:
  - Reference these files as evidence only.
  - If a discrepancy is found, correct the documentation unless the user explicitly asks to remediate the code too.

## Assumptions & Decisions

- Decision: The primary execution target is the documentation layer, especially `.trae/documents/master_build_plan.md`.
- Decision: The existing `master_build_plan.md` is considered the baseline artifact to refine, not something to replace from scratch.
- Decision: The existing reconciliation spec package is secondary and only needs edits if it diverges from the finalized master plan.
- Decision: Confirmed missing infrastructure stays labeled as missing build work:
  - `InfoTooltip`
  - `TeamVsTeamLayout`
  - comments storage/schema
  - upcoming-events storage/route
- Decision: Confirmed live terminology remains authoritative:
  - `UserAvatar` / `Avatar`
  - `match_teams`
  - `match_players.team_id`
  - golf `chip_off` via `house_rules.variant`
  - darts variants via `house_rules.variant`
- Decision: The plan should explicitly preserve known mismatches and gaps instead of silently normalizing them:
  - rematch room-code hardening gap
  - custom-room `buttons` vs `scoring_buttons` mismatch
  - partial replay/reconnect support across sports
- Assumption: No new master-plan sections are needed unless final verification reveals a material repo area missing from the current document.
- Assumption: The user wants a durable planning artifact for future child specs, not a bundled implementation of the documented blockers.

## Verification Steps

1. Re-check `master_build_plan.md` section-by-section against:
   - `src/pages/NewMatchPage.tsx`
   - `src/pages/MatchRoomPage.tsx`
   - `src/pages/SpectatorPage.tsx`
   - `src/lib/matches.ts`
   - `src/lib/stats.ts`
   - `src/lib/supabase.ts`
   - `src/contexts/AuthContext.tsx`
   - `src/components/UserAvatar.tsx`
   - `src/components/Avatar.tsx`
   - `src/components/sports/*`
   - `supabase/migrations/20260722_security_audit_rls.sql`
2. Confirm every shared dependency named as live infrastructure actually exists under that name.
3. Confirm every missing dependency is still labeled as missing and not treated as ready-made infrastructure.
4. Confirm every runtime claim distinguishes among:
   - persisted and rehydratable
   - event-logged but not reconnect-safe
   - local-state-only
5. Confirm every setup/runtime/analytics/auth path points to the correct live file or symbol.
6. Confirm the spec package under `.trae/specs/reconcile-master-build-plan/` does not contradict the finalized master plan.
7. If no drift is found, leave app code untouched and report that the master plan is already materially aligned with the live repository.
