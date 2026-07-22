# Master Build Plan

## Summary

This document is the code-backed replacement for the earlier draft master plan. It treats the live repository as the source of truth for shared component names, setup flow entry points, runtime architecture, stats aggregation, and auth/schema assumptions so future feature specs do not build on missing or renamed infrastructure.

## Live Product Baseline

### Core Shells
- `src/pages/NewMatchPage.tsx` is the live match setup shell. It owns the sport -> variant -> config -> players flow and persists `house_rules` plus `custom_config`.
- `src/pages/MatchRoomPage.tsx` is the live scorer shell. It loads match metadata, teams, players, participant profiles, and routes each match into the correct sport room component.
- `src/pages/SpectatorPage.tsx` is the read-only shell. It reuses the sport room components, so spectator accuracy depends on each room's own hydration and realtime strategy.
- `src/pages/LeaderboardPage.tsx`, `src/pages/ProfilePage.tsx`, and `src/lib/stats.ts` are the live analytics surfaces.

### Confirmed Sport Coverage
- `cricket`: classic team mode and backyard individual mode
- `golf`: classic golf plus `chip_off` and `putt_vs_putt` variants
- `darts`: countdown, around-the-world, and killer
- Additional room shells: `table_tennis`, `pool`, `basketball`, `cards`, and `custom`

## Shared Dependency Audit

### Confirmed Live Infrastructure
- Avatar stack: `src/components/UserAvatar.tsx` wraps `src/components/Avatar.tsx`
- Team storage: `match_teams` plus `match_players.team_id`
- Team turn-order storage: `match_players.lineup_order`
- Match setup and persistence: `match_rooms`, `match_players`, `match_events`, `cricket_innings`, `cricket_player_stats`, `golf_holes`, `golf_scores`
- Auth session model: `active_sessions`
- Session-aware request context: `x-session-id` attached in `src/lib/supabase.ts`
- RLS helpers: `get_current_session_profile_id()` and `is_match_participant()` in `supabase/migrations/20260722_security_audit_rls.sql`
- Season points source of truth: `SEASON_POINT_RULES` in `src/lib/stats.ts`
- Shared rule/stat copy sources: `src/data/ruleDefinitions.ts` and `src/data/statDefinitions.ts`
- Shared rules UI: `src/components/InfoTooltip.tsx` and `src/components/HouseRulesPanel.tsx`
- Shared PvP setup/runtime helpers: `src/components/LineupOrderBuilder.tsx`, `src/components/TieBreakerChallenge.tsx`, and `src/components/sports/PvPRoom.tsx`
- PvP analytics migration: `supabase/migrations/20260722_putt_vs_putt_support.sql`

### Renamed Or Corrected Assumptions
- `PlayerAvatar` is not the live shared component name. Use `UserAvatar` for profile-aware rendering and `Avatar` as the low-level primitive.
- Generic `teams` planning should target `match_teams` and `match_players.team_id`, not an assumed standalone `teams` table.
- Chip Off is not a separate sport enum. It is the `golf` sport with `house_rules.variant === 'chip_off'`.
- Putt vs Putt is also not a separate sport enum. It is the `golf` sport with `house_rules.variant === 'putt_vs_putt'`.
- PvP team lineup order is not stored on `match_teams`; it persists per player on `match_players.lineup_order`.
- Generic ledger planning should target `match_events` and `recordEvent()` / `undoLastEvent()`, not an assumed `ledger_entries` table.
- Darts sub-modes are configured through `house_rules.variant`, not a separate page or table per sub-game.

### Missing Shared Infrastructure
- No shared `TeamVsTeamLayout` component exists in `src/components`
- No shared `comments` table or spectator comments schema exists in `supabase/migrations`
- No upcoming-events schema or route exists in the current app shell

Future specs must treat each missing item above as required build work rather than current infrastructure.

## Authoritative Integration Paths

### Match Setup
- `NewMatchPage.tsx` persists the match row in `match_rooms`
- Team matches insert `match_teams` followed by `match_players`
- Backyard cricket and other individual modes skip `match_teams` and use `match_players` only
- Putt vs Putt is a team-based golf variant that persists `house_rules.variant === 'putt_vs_putt'` plus `house_rules.starting_balls_per_team`
- Putt vs Putt lineup order persists on each `match_players.lineup_order` row rather than a team-level array
- Cricket setup seeds `cricket_innings` during match creation
- Match sharing uses the generated `room_code`; `NewMatchPage.tsx` currently uses an 8-character UUID segment, not a short `Math.random()` token
- Rematch creation is not yet normalized to that same room-code strategy: `CricketRoom.tsx`, `DartsRoom.tsx`, and `ChipOffRoom.tsx` still generate 5-character `Math.random()` room codes, so future security or sharing work must treat rematches as a separate hardening gap

### Match Runtime
- `MatchRoomPage.tsx` calls `getMatchByCode()`, `getMatchTeams()`, and `getMatchPlayers()` from `src/lib/matches.ts`
- Sport room dispatch is centralized in `getSportRoom()` inside `MatchRoomPage.tsx`
- `MatchRoomPage.tsx` also updates `active_sessions.match_id` while a scorer is inside a room
- `MatchRoomPage.tsx` now mounts `HouseRulesPanel` in the header so live scorers can inspect active house rules mid-match
- Shared match deletion flows through `deleteMatch()` in `src/lib/matches.ts`; the Dashboard now trims deleted rows from local state before reloading so the UI does not depend solely on the next fetch cycle

### Spectator Runtime
- `SpectatorPage.tsx` loads the same match, teams, players, and participant profiles as the scorer shell
- Sport-specific spectator freshness is delegated to the room component itself
- `SpectatorPage.tsx` also mounts `HouseRulesPanel` in the header for read-only rules reference
- Planning must not assume a universal spectator event pipeline shared by all sports

### Stats And Leaderboards
- Match completion flows through `updateMatchStatus()`, `completeMatchWithWinner()`, or `completeMatchWithTeamWinner()` in `src/lib/matches.ts`
- Those completion paths call `updateCareerStats()` in `src/lib/stats.ts`
- `aggregateMatchStats()` in `src/lib/stats.ts` is the main match-to-career aggregation path
- `LeaderboardPage.tsx` pulls from `getGlobalLeaderboardData()` rather than directly from `player_career_stats`
- That leaderboard path is a mixed-source aggregation built from completed `match_rooms`, `match_players`, `profiles`, `match_events`, and `cricket_player_stats`, while `player_career_stats` remains the persisted per-profile summary used by profile analytics and completion-time rollups
- `LeaderboardPage.tsx` refreshes when completed `match_rooms` rows change
- Golf, Chip Off, and PvP are unified in leaderboard reporting under the golf family logic
- `LeaderboardPage.tsx` now includes the additive golf-family PvP column `Career Holes`
- `player_career_analytics` now includes `putt_vs_putt` analytics fields such as `holed_putts_total`, `total_putt_attempts`, `career_pct_holed`, and `clutch_putts`

### Auth And Protected Data
- `src/contexts/AuthContext.tsx` owns login/logout, canonical profile refresh, session creation, heartbeat refresh, and logout cleanup
- `src/lib/supabase.ts` injects `x-session-id` from `localStorage`
- `supabase/migrations/20260722_security_audit_rls.sql` is the authoritative RLS hardening layer for `active_sessions`, `match_rooms`, `match_players`, `match_teams`, `match_events`, `cricket_innings`, `cricket_player_stats`, `golf_scores`, and profile updates
- `src/lib/supabase.ts` must preserve Supabase's built-in headers when injecting `x-session-id`; replacing the header object outright breaks requests with `No API key found in request`

## Runtime Persistence Caveats

### Persisted And Rehydratable Today
- `CricketRoom.tsx` hydrates from `cricket_innings`, `cricket_player_stats`, and recent `match_events`, then subscribes to realtime on those tables
- `GolfRoom.tsx` hydrates from `golf_holes` and `golf_scores`, then subscribes to realtime on both tables
- `ChipOffRoom.tsx` rebuilds state from ordered `match_events` and subscribes to realtime on `match_events`
- `PvPRoom.tsx` rebuilds state from ordered `match_events`, match rosters, and `house_rules.starting_balls_per_team`, then subscribes to realtime on `match_events`

### Event Logged But Not Fully Rehydratable
- `DartsRoom.tsx` records events to `match_events`, but its live room state is an in-memory engine state and it does not reload from persisted events on reconnect

### Local State Only Today
- `TableTennisRoom.tsx`
- `PoolRoom.tsx`
- `BasketballRoom.tsx`
- `CardsRoom.tsx`
- `CustomRoom.tsx`

Future specs for those rooms must not assume reconnect-safe runtime state or reliable spectator replay until hydration and realtime subscriptions are added.

## Known Architecture Mismatches

- `NewMatchPage.tsx` writes custom scoring controls to `custom_config.buttons`
- `CustomRoom.tsx` reads `custom_config.scoring_buttons`

Any future custom-sport planning should treat that mismatch as a prerequisite cleanup before extending the custom-room model.

## Mistakes To Avoid Repeating

- Do not overwrite Supabase client headers when injecting `x-session-id`; always merge through `new Headers(options.headers || {})` so the built-in `apikey` header survives.
- Do not assume new golf-family modes need a new top-level `sport` enum; Chip Off and PvP both route through `sport === 'golf'` plus `house_rules.variant`.
- Do not assume missing infrastructure from older drafts still needs to be built; `InfoTooltip`, `HouseRulesPanel`, rule definitions, stat definitions, PvP room scaffolding, and lineup-order storage are live now.
- After adding inline instrumentation or other temporary debugging code, run a real build or transformed module check immediately; a malformed one-liner can create a misleading secondary failure before evidence is collected.
- Do not rely on unchecked parallel child-table cleanup in shared delete helpers; deleting parent/child match data needs deterministic, error-checked ordering to avoid transient UI crashes during refresh.
- Do not assume a Trae preview/runtime crash always proves an app-side regression; verify the same flow against the actual dev app/browser path before widening the fix.

## Planning Rules For Child Specs

- Cite real files and symbols when depending on shared infrastructure
- Use `UserAvatar` and `Avatar` terminology, not `PlayerAvatar`
- Use `match_teams` and `match_players.team_id`, not an assumed `teams` table
- Treat `InfoTooltip`, `TeamVsTeamLayout`, comments storage, and upcoming-events storage as missing dependencies unless they are built first
- Distinguish "persisted and live today" from "planned future-state" whenever a feature touches spectator mode, reconnect behavior, or realtime scoring
- Route leaderboard and analytics work through `src/lib/stats.ts`, `src/lib/matches.ts`, and `src/pages/LeaderboardPage.tsx`
- Route setup work through `src/pages/NewMatchPage.tsx`
- Route live room work through `src/pages/MatchRoomPage.tsx`, `src/pages/SpectatorPage.tsx`, and the relevant sport room component

## Feature Queue Reconciled To Live Code

### Ready To Extend On Existing Foundations
- House-rule explanations and live rules reference are now built on `ruleDefinitions.ts`, `InfoTooltip.tsx`, and `HouseRulesPanel.tsx`; future sports should ship their rule copy into that shared dictionary
- Stat definition tooltips should build on `statDefinitions.ts` and `InfoTooltip.tsx`; the broader leaderboard/profile rollout still remains future work
- Golf-family leaderboard follow-ups should build on existing golf + Chip Off + PvP aggregation in `src/lib/stats.ts`

### Requires New Shared Infrastructure First
- Spectator comments and cheers: needs new schema, RLS, event model, and UI
- Upcoming events: needs new schema, route, and dashboard/profile integration
- Team-vs-team shared presentation abstractions: needs a new shared layout component before specs can depend on it

### Requires Runtime Hardening Before Feature Depth
- Basketball live-match upgrades: current room is local-state-only
- Poker and blackjack: can live under the cards family, but need dedicated rules engines, persistence, and spectator-safe hydration
- Putt Battle or other golf-family variants: should branch from golf-family setup and leaderboard logic, but need a new room component and explicit persistence model
- Chip Off team play: current Chip Off room is individual-first and would need setup, scoring, and winner aggregation changes before team assumptions are valid

## Verification Checklist

- Shared dependency names in future specs match the live codebase
- Missing infrastructure is labeled as missing, not assumed
- Setup work points to `NewMatchPage.tsx`
- Runtime work points to `MatchRoomPage.tsx`, `SpectatorPage.tsx`, and the correct sport room
- Stats work points to `src/lib/stats.ts` and completion flows in `src/lib/matches.ts`
- Auth-sensitive work points to `active_sessions`, `x-session-id`, and the 20260722 RLS migration
- Custom Supabase fetch wrappers preserve existing SDK headers while appending session context
