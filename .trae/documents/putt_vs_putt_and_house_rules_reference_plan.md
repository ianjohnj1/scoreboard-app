# Putt vs Putt And House Rules Reference Plan

## Summary

Implement two connected features against the live repository:

1. **PvP (Putt vs Putt)** as a new **golf-family variant**, not a new top-level sport, so it plugs into the existing `match_rooms.sport = 'golf'` routing and the combined Golf leaderboard tab.
2. **In-app house-rules explanations and a live rules reference panel** using a shared code-backed definitions source plus a reusable tooltip component.

This plan intentionally corrects several draft assumptions to match the live app:

- Use `match_teams` and `match_players`, not a shared `teams` table.
- Use `match_events` plus `recordEvent()`, not a `ledger_entries` table.
- Add PvP under `house_rules.variant = 'putt_vs_putt'`, matching the existing Chip Off pattern.
- Build one reusable room component under the live `src/components/sports/` structure so scorer and spectator flows can both reuse it.
- Store rule definitions in a shared code file for v1.

## Current State Analysis

### Live Routing And Setup

- `src/pages/NewMatchPage.tsx` is the live setup shell and currently branches golf into `classic` and `chip_off` only.
- The live match model stores the top-level sport in `match_rooms.sport` and uses `match.house_rules.variant` for sub-modes such as:
  - golf `chip_off`
  - cricket `backyard`
  - darts `countdown`, `around_the_world`, and `killer`
- `src/pages/NewMatchPage.tsx` currently treats golf as an individual format, while team flows create rows in `match_teams` and assign `match_players.team_id`.
- `src/pages/MatchRoomPage.tsx` dispatches sport rooms through `getSportRoom()`, and `src/pages/SpectatorPage.tsx` reuses the same room components from `src/components/sports/`.

### Live Schema And Event Model

- The live shared team model is `match_teams` plus `match_players.team_id`; there is no shared `teams` table.
- `match_players` already carries ordering-style fields such as `batting_order`, proving per-player ordering fits the current schema pattern better than a team-level ordered array.
- The live event log is `match_events`, with writes centralized through `recordEvent()` in `src/lib/matches.ts`.
- `src/lib/matches.ts` already supports both `completeMatchWithWinner()` and `completeMatchWithTeamWinner()`, which is enough for PvP’s team winner flow.
- There is no shared `ledger_entries` table, no `lineup_order` field today, and no PvP-specific persistence yet.

### Live Stats, Leaderboards, And Profiles

- `src/lib/stats.ts` is the central match-to-career aggregation path.
- `src/pages/LeaderboardPage.tsx` already shows a combined Golf tab with additive variant-specific columns for classic golf and Chip Off.
- `src/pages/ProfilePage.tsx` pulls per-sport analytics from the shared `player_career_analytics` view and hardcodes special stat sections for current sports.
- `src/lib/supabase.ts` defines the client-side `PlayerCareerAnalytics` type, which currently includes cricket, Chip Off, and darts analytics but no PvP fields.
- Existing analytics already treat Chip Off as a golf variant mapped into its own sport label in SQL, so the same pattern can be extended for `putt_vs_putt`.

### Live UI Infrastructure Relevant To House Rules

- `src/pages/NewMatchPage.tsx` contains local `RuleToggle`, `RuleSelect`, and `RuleNumber` helpers, but no shared tooltip support.
- `src/pages/MatchRoomPage.tsx` and `src/pages/SpectatorPage.tsx` both have stable header regions where a rules button can be added.
- There is no shared `InfoTooltip` component.
- There is no `src/data/ruleDefinitions.ts` or `src/data/statDefinitions.ts` yet.
- There is no existing `HouseRulesPanel` component.

## Proposed Changes

### 1. Add Shared Rule/Stat Definition Infrastructure

- **New file:** `src/data/ruleDefinitions.ts`
  - **What:** Create the shared source of truth for current live `house_rules` keys plus the new PvP rules.
  - **Why:** The setup UI and live rules panel need one authoritative dictionary for labels, value text, and one-line explanations.
  - **How:** Export a typed dictionary keyed by sport family and rule key, including support for variant-specific values such as `chip_off` and `putt_vs_putt`.

- **New file:** `src/data/statDefinitions.ts`
  - **What:** Create the shared stat-definition dictionary expected by the tooltip rollout and add the four PvP stats.
  - **Why:** PvP profile/leaderboard copy should not be hardcoded ad hoc once tooltips are introduced.
  - **How:** Add entries for `wins`, `holed_putts_total`, `career_pct_holed`, and `clutch_putts`, and structure the file so existing sports can be backfilled incrementally.

- **New file:** `src/components/InfoTooltip.tsx`
  - **What:** Build the reusable info icon plus tooltip/popover primitive.
  - **Why:** The repo currently has no shared tooltip component, and both rule explanations and stat explanations need the same building block.
  - **How:** Reuse the existing visual system in `src/components/Modal.tsx`/current Tailwind patterns, with a mobile-friendly tap interaction and desktop-friendly hover/focus behavior.

- **New file:** `src/components/HouseRulesPanel.tsx`
  - **What:** Build the shared read-only house-rules summary panel for active match and spectator headers.
  - **Why:** Both scorer and spectator flows need the same “what rules are active?” UI.
  - **How:** Accept `match.sport`, `match.house_rules`, and optional variant/custom labels; look up labels and selected-value text from `ruleDefinitions.ts`; render inside the existing modal/panel styling system.

### 2. Wire House-Rule Explanations Into Live Setup And Headers

- **Update:** `src/pages/NewMatchPage.tsx`
  - **What:** Replace the current plain labels inside `RuleToggle`, `RuleSelect`, and `RuleNumber` with label rows that can render `InfoTooltip`.
  - **Why:** This is the only live setup screen, so it is the correct extension point for inline house-rule explanations.
  - **How:**
    - Refactor the local rule helper components to accept a rule-definition descriptor or `{ label, explanation }`.
    - Backfill definitions for every rule key the file currently exposes today:
      - cricket toggles/numbers
      - darts countdown / around-the-world / killer settings
      - Chip Off settings
      - new PvP settings
    - Keep `Practice Mode` separate from `house_rules` in the UI copy, since it lives on `match_rooms.is_practice`, not in the house-rules payload.

- **Update:** `src/pages/MatchRoomPage.tsx`
  - **What:** Add a rules button to the live scorer header.
  - **Why:** This is the shared shell all scorekeepers enter before the sport room renders.
  - **How:** Mount `HouseRulesPanel` from the header next to the existing share/menu actions.

- **Update:** `src/pages/SpectatorPage.tsx`
  - **What:** Add the same rules button/panel to the spectator header.
  - **Why:** Spectators currently have no way to understand the active variant or house rules after joining mid-match.
  - **How:** Reuse the same `HouseRulesPanel` component and dictionary as scorer mode.

### 3. Add PvP Setup Flow As A Golf Variant

- **New file:** `src/components/LineupOrderBuilder.tsx`
  - **What:** Create the shared lineup-order UI for team roster ordering.
  - **Why:** PvP requires fixed looping lineup order, and the live repo has no reusable ordering component yet.
  - **How:** Build a simple reorderable list that works for 1–5 players per team and returns ordered player IDs or numeric positions.

- **Update:** `src/pages/NewMatchPage.tsx`
  - **What:** Add PvP as a third golf branch alongside classic golf and Chip Off.
  - **Why:** This file already owns sport selection, variant selection, rule configuration, and roster creation.
  - **How:**
    - Add a new golf variant choice that sets `house_rules.variant = 'putt_vs_putt'`.
    - Treat PvP as **team-based golf**, even though other golf modes remain individual.
    - Add `starting_balls_per_team` to the PvP rules UI with default `5`.
    - Reuse the existing 2-team setup path in `match_teams`/`match_players`.
    - Capture lineup order per team with `LineupOrderBuilder`.
    - Persist lineup order onto each `match_players` row through a new shared `lineup_order` numeric field rather than overloading cricket’s `batting_order`.

### 4. Add PvP Runtime And Spectator Reuse

- **New file:** `src/components/sports/PvPRoom.tsx`
  - **What:** Build the live PvP room used by both scorer and spectator shells.
  - **Why:** The live app architecture reuses the same sport room component for both scoring and spectator mode.
  - **How:**
    - Hydrate state from `match_events`, `match_teams`, `match_players`, and `house_rules.starting_balls_per_team`.
    - Derive the remaining shared ball pool from starting balls minus holed `putt_attempt` events.
    - Derive team scores from holed `putt_attempt` events.
    - Derive the active team/player turn from alternating team turns plus each team’s looping `lineup_order`.
    - Show the two-button result input (`Holed`, `Missed`) for scorer mode only.
    - Support `undoLastEvent()` for the latest non-undone PvP event.
    - When the shared pool reaches zero:
      - if one team leads, complete the match through `completeMatchWithTeamWinner()`
      - if tied, open the tie-break flow instead of ending immediately

- **New file:** `src/components/TieBreakerChallenge.tsx`
  - **What:** Build the dedicated “Putt Off” flow used at tied match end.
  - **Why:** The tie-break has its own representative selection and temporary distance-entry workflow.
  - **How:**
    - Let each team choose one representative from its roster.
    - Collect two numeric distance entries per representative with clear copy telling users to use the same real-world unit for all four inputs.
    - Compute the two averages client-side, determine the lower average winner, then persist only the `tiebreak_result` event outcome plus the winning team.
    - Do **not** persist the raw distance values.

- **Update:** `src/pages/MatchRoomPage.tsx`
  - **What:** Dispatch golf `putt_vs_putt` to `PvPRoom`.
  - **Why:** This is the live scorer routing entry point.
  - **How:** Extend `getSportRoom()` with a golf-variant override just like Chip Off.

- **Update:** `src/pages/SpectatorPage.tsx`
  - **What:** Dispatch golf `putt_vs_putt` to the same `PvPRoom`.
  - **Why:** The live spectator shell reuses room components rather than maintaining a separate spectator component tree.
  - **How:** Extend the current golf-variant override logic the same way as scorer mode.

- **Update:** `src/lib/matches.ts`
  - **What:** Teach sport labels to display PvP correctly.
  - **Why:** Headers and history surfaces call `getSportLabel()`.
  - **How:** Add a variant label such as `PvP (Putt vs Putt)` for `house_rules.variant === 'putt_vs_putt'`.

### 5. Extend Schema And Event Support For PvP

- **New migration:** `supabase/migrations/<timestamp>_add_putt_vs_putt.sql`
  - **What:** Add the minimum schema needed for PvP while staying aligned with the live data model.
  - **Why:** The draft assumes a `teams` table and `ledger_entries`; the live repo uses neither.
  - **How:**
    - Add `match_players.lineup_order` as a nullable integer for shared lineup sequencing.
    - Leave `match_rooms.sport` as `golf`; no new top-level sport column/value is required for routing.
    - Add any needed `CHECK`/documentation comments for `house_rules.variant = 'putt_vs_putt'` and `house_rules.starting_balls_per_team`.
    - Ensure RLS remains compatible through existing participant-based policies on `match_events`, `match_players`, and `match_teams`.

- **Event model change:** reuse `match_events`
  - **What:** Add PvP event types to the application and analytics logic:
    - `putt_attempt`
    - `tiebreak_result`
  - **Why:** `match_events` already provides undo, sequencing, and realtime compatibility.
  - **How:** Persist PvP actions through `recordEvent()` using event data shaped around:
    - turn number
    - putting team/player IDs
    - outcome
    - tie-break representative/winner data

### 6. Extend Career Stats, Analytics, Leaderboard, And Profile Surfaces

- **Update:** `src/lib/stats.ts`
  - **What:** Add PvP-aware aggregation in both the completion-time and leaderboard-time pipelines.
  - **Why:** This file is the live source of truth for career rollups and the Golf leaderboard family.
  - **How:**
    - In `aggregateMatchStats()`, treat golf `putt_vs_putt` as a distinct per-player stat family, similar to the current Chip Off split.
    - Count:
      - `holed_putts_total`
      - `total_putt_attempts`
      - `career_pct_holed`
      - `clutch_putts` from `tiebreak_result`
    - Emit `sport: 'putt_vs_putt'` for persisted/career analytics purposes while still treating the match as part of the golf family for leaderboard aggregation.
    - In `getGlobalLeaderboardData()`, add a new combined-golf field for PvP “Career Holes” and continue folding PvP matches into shared Golf `Played`/`Wins`.

- **Update:** `src/lib/supabase.ts`
  - **What:** Extend client types for the new analytics outputs.
  - **Why:** `ProfilePage.tsx` and future tooltip surfaces depend on typed access to analytics fields.
  - **How:** Add PvP-specific fields to `PlayerCareerAnalytics` and, if needed, augment leaderboard entry typing for the new Golf column.

- **Update:** `src/pages/LeaderboardPage.tsx`
  - **What:** Add the new Golf-column field for PvP “Career Holes”.
  - **Why:** The existing Golf tab already supports additive variant-specific columns, which is exactly the requested pattern.
  - **How:** Extend the Golf row rendering with a new right-side stat block alongside `Best(C)`, `Best(Ch)`, and `HIO`, without restructuring tabs or shared `Played`/`Wins`.

- **Update:** `src/pages/ProfilePage.tsx`
  - **What:** Add a PvP profile section and player-card stat presentation.
  - **Why:** The feature requires `Wins` and `Career % Holed` as the headline pair, with `Career Holes` and `Clutch Putts` visible in the fuller stats surface.
  - **How:**
    - Add `putt_vs_putt` to the per-sport stats rendering.
    - Show the compact pair prominently.
    - Include the two supporting counters in the detailed stat grid.
    - Extend any comparison list only if it can be done cleanly without bloating v1 scope.

- **Update:** analytics migrations under `supabase/migrations/`
  - **What:** Extend the shared `player_career_analytics` view rather than creating an isolated `pvp_stats` view that the current UI would not read.
  - **Why:** The live profile surface already depends on one shared analytics view.
  - **How:** Mirror the existing Chip Off mapping approach:
    - map golf `putt_vs_putt` matches into sport label `putt_vs_putt`
    - aggregate PvP attempts, makes, make rate, and clutch wins from `match_events`

## Assumptions & Decisions

- **Decision:** PvP is implemented as `match_rooms.sport = 'golf'` with `house_rules.variant = 'putt_vs_putt'`.
- **Decision:** Team sequencing uses a new shared `match_players.lineup_order` field, not a `match_teams.lineup_order` array and not a cricket-only reuse of `batting_order`.
- **Decision:** House-rule definitions live in `src/data/ruleDefinitions.ts` for v1, not in a database table.
- **Decision:** PvP persistence uses `match_events`, not a new ledger table.
- **Decision:** PvP scorer and spectator mode share the same `src/components/sports/PvPRoom.tsx` component, matching the live room architecture.
- **Decision:** The live shared Golf tab remains combined; PvP only adds a new additive stat column and does not trigger leaderboard tab restructuring.
- **Decision:** Raw tie-break distance measurements remain ephemeral UI input and are never stored long-term.
- **Assumption:** PvP remains strictly two-team in v1, even though team size can range from 1 to 5 per side.
- **Assumption:** The rule-definitions backfill covers all live rule keys currently exposed in `NewMatchPage.tsx`; future sports or deeper card-game rule systems remain separate feature work.

## Verification Steps

1. **Setup flow**
   - Confirm `NewMatchPage.tsx` offers PvP under the golf branch.
   - Confirm PvP uses the existing two-team creation path and persists `lineup_order` per player.
   - Confirm `house_rules.variant = 'putt_vs_putt'` and `starting_balls_per_team` persist correctly.

2. **Runtime / spectator**
   - Confirm both `MatchRoomPage.tsx` and `SpectatorPage.tsx` route golf PvP matches into `PvPRoom`.
   - Confirm scorer mode can record `Holed` and `Missed`, update derived pool/score state, and undo the latest event.
   - Confirm a tied empty-pool finish opens the tie-break flow and a non-tied finish completes with a team winner.
   - Confirm spectators see the same derived scoreboard and player-card headline stats without scorer controls.

3. **Rules explanations**
   - Confirm every live house-rule control in `NewMatchPage.tsx` now has a tooltip explanation sourced from `ruleDefinitions.ts`.
   - Confirm scorer and spectator headers can open a rules summary for the active match.
   - Confirm the panel text reflects the actual chosen values for the match instead of generic labels only.

4. **Analytics / leaderboard**
   - Confirm PvP match completion updates career stats without breaking classic golf or Chip Off rollups.
   - Confirm the Golf leaderboard gains the new “Career Holes” column while preserving combined `Played` and `Wins`.
   - Confirm the profile page shows PvP headline and supporting stats from the shared analytics view.

5. **Regression checks**
   - Confirm existing classic golf, Chip Off, cricket, darts, and other sport routing still works.
   - Confirm the new tooltip/panel infrastructure does not break mobile layout in setup or header shells.
   - Run diagnostics on all edited TS/TSX files and fix any introduced type/lint errors before final handoff.
