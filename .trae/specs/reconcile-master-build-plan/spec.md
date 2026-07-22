# Master Build Plan Reconciliation Spec

## Why
The current master build plan was drafted without first auditing the live codebase, so several named components, tables, and integration assumptions may not match what is actually shipped. Before future features are handed off for implementation, the plan needs a code-backed reconciliation pass so new work targets real extension points instead of drifting architecture.

## What Changes
- Audit every shared dependency named in the master build plan and map it to the live codebase, a renamed equivalent, or a confirmed gap.
- Define the actual integration points for new setup flows, match rooms, spectator behavior, leaderboard aggregation, and auth-protected data features.
- Correct plan assumptions that currently reference non-existent or renamed infrastructure such as `PlayerAvatar`, `InfoTooltip`, `TeamVsTeamLayout`, `teams`, and `comments`.
- Require future child specs to cite real symbols/files when depending on shared infrastructure.
- Record architecture caveats that affect implementation sequencing, including partial realtime/replay coverage across sports and spectator update inconsistencies.

## Impact
- Affected specs: house rules explanations, stat definition tooltips, spectator comments and cheers, upcoming events, Chip Off team play, Putt Battle, basketball live match, poker, blackjack, leaderboard golf-family follow-ups
- Affected code: `src/pages/NewMatchPage.tsx`, `src/pages/MatchRoomPage.tsx`, `src/pages/SpectatorPage.tsx`, `src/pages/LeaderboardPage.tsx`, `src/lib/matches.ts`, `src/lib/stats.ts`, `src/lib/supabase.ts`, `src/contexts/AuthContext.tsx`, `src/components/UserAvatar.tsx`, `src/components/Avatar.tsx`, `src/components/sports/*`, `supabase/migrations/*`

## ADDED Requirements
### Requirement: Verify Shared Dependencies Against Live Code
The system SHALL verify every shared component, helper, table, and layout dependency named in the master build plan against the live codebase before future implementation work treats it as available infrastructure.

#### Scenario: Shared dependency exists under a different name
- **WHEN** the master build plan references a dependency that exists in the codebase under a different symbol or file name
- **THEN** the reconciliation output records the actual symbol and file path as the authoritative dependency
- **AND** future specs use the code-backed name instead of the assumed one

#### Scenario: Shared dependency is missing
- **WHEN** the master build plan references a shared dependency that does not exist in the live codebase
- **THEN** the reconciliation output marks that dependency as missing rather than treating it as ready-made infrastructure
- **AND** any future spec depending on it identifies creation of that dependency as required work

#### Scenario: Shared dependency already exists as live infrastructure
- **WHEN** the master build plan references a dependency that is confirmed in the live codebase
- **THEN** the reconciliation output records how that dependency is currently used
- **AND** future specs can build on it without re-auditing the same assumption

### Requirement: Define Real Integration Paths
The system SHALL document the actual interaction points new features must use for setup, match runtime, spectator mode, stats aggregation, and authenticated data access.

#### Scenario: Match-creation feature is added
- **WHEN** a future feature needs new house rules, team setup, or roster inputs
- **THEN** the reconciliation output points implementation toward `NewMatchPage.tsx` and its current rule/config persistence flow

#### Scenario: Match-room or spectator feature is added
- **WHEN** a future feature needs room UI, live scoring, or spectator/broadcast behavior
- **THEN** the reconciliation output points implementation toward `MatchRoomPage.tsx`, `SpectatorPage.tsx`, and the relevant sport room component
- **AND** it states whether that sport already supports reconnect-safe persisted state or only local component state

#### Scenario: Leaderboard or analytics feature is added
- **WHEN** a future feature needs rankings, profile stats, or season-point updates
- **THEN** the reconciliation output points implementation toward `stats.ts`, `matches.ts`, and the current leaderboard data flow
- **AND** it clarifies whether the feature plugs into live event aggregation, persisted career stats, analytics views, or more than one of those paths

### Requirement: Preserve Security And Schema Reality
The system SHALL reconcile plan assumptions about protected tables and helpers to the live Supabase schema and auth model.

#### Scenario: Team or comment features are planned
- **WHEN** a future spec references shared team or comment storage
- **THEN** the reconciliation output distinguishes between confirmed live schema such as `match_teams`
- **AND** not-yet-built schema such as a shared `comments` table

#### Scenario: Auth-gated feature is planned
- **WHEN** a future spec depends on profile ownership, admin actions, or session-aware access
- **THEN** the reconciliation output points implementation toward the current `x-session-id` flow, `active_sessions`, and the database helpers already enforcing RLS

## MODIFIED Requirements
### Requirement: Master Plan And Child Specs Use Code As The Source Of Truth
The master build plan and all linked child specs SHALL treat the live codebase as the authoritative source for shared infrastructure names, integration points, and current behavior.

#### Scenario: A planning document conflicts with the codebase
- **WHEN** a child spec or master-plan note conflicts with the live code
- **THEN** the reconciliation output preserves the code-backed behavior as authoritative
- **AND** the planning document is corrected to reflect the confirmed implementation reality or explicitly marked as aspirational

## REMOVED Requirements
### Requirement: Assume Named Shared Infrastructure Exists As Written
**Reason**: The current plan references several shared dependencies as if they already exist, but the live repo shows a mix of renamed, inlined, and missing infrastructure.
**Migration**: Replace assumed names with confirmed ones where available, such as `UserAvatar`/`Avatar` and `match_teams`, and explicitly mark missing dependencies such as `InfoTooltip`, `TeamVsTeamLayout`, and `comments` as future build work rather than current foundations.
