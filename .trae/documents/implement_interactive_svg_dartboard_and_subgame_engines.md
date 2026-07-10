## Summary

Replace the current static button-based Darts input in `src/components/sports/DartsRoom.tsx` with a mobile-friendly interactive SVG dartboard and add distinct runtime logic engines for the three configured Darts sub-modes:

* `countdown`

* `around_the_world`

* `killer`

The implementation should keep Darts under the existing `darts` sport route, branch by `match.house_rules.variant`, and support automatic winner detection, standard 3-dart turn rotation, undo, and post-match stats/event persistence to Supabase.

## Current State Analysis

* `src/components/sports/DartsRoom.tsx`

  * Only supports countdown-style scoring.

  * Uses quick score buttons (`20, 19, 18, 17, 16, 15, 25, 50, 0`) plus a numeric input.

  * Tracks state locally as:

    * `scores`

    * `turns`

    * `currentPlayerIdx`

    * `currentDarts`

    * `winner`

  * Records only three Darts event types:

    * `darts_turn`

    * `darts_bust`

    * `darts_win`

  * Imports `undoLastEvent` but does not currently expose an Undo control.

* `src/pages/NewMatchPage.tsx`

  * Already persists Darts setup as:

    * `house_rules.variant` = `countdown | around_the_world | killer`

    * `custom_config.darts_sub_mode_id`

  * Already stores per-mode rules such as:

    * `start_score`

    * `double_out`

    * `skip_ahead_via_multiples`

    * `ring_restriction`

    * `starting_lives`

    * `killer_activation_ring`

* `src/pages/MatchRoomPage.tsx`

  * Routes all Darts matches to `DartsRoom`.

  * Match completion is currently manual via `handleEnd()`, which calls `updateMatchStatus(match.id, 'completed')`.

  * No existing helper automates setting `winner_profile_id` before completion.

* `src/pages/SpectatorPage.tsx`

  * Also renders `DartsRoom`, but with `isSpectator: true`.

* `src/lib/matches.ts`

  * Provides:

    * `recordEvent()`

    * `undoLastEvent()`

    * `updateMatchStatus()`

  * `updateMatchStatus('completed')` triggers `updateCareerStats(matchId)`.

* `src/lib/stats.ts`

  * Darts analytics currently only aggregate generic point totals and wins from:

    * `darts_turn`

    * `darts_bust`

    * `darts_win`

  * Existing `extra_stats` merging logic can absorb additional numeric fields.

* No existing SVG dartboard component or Darts-specific engine module exists in `src`.

## Assumptions & Decisions

* The Darts match room will remain a single sport room entrypoint, but it will delegate to distinct internal engine branches by `match.house_rules.variant`.

* Killer target assignment will use:

  * random unique target numbers by default

  * manual admin override before the first throw

* Killer activation rule will use:

  * one valid hit on the player’s own assigned target in the configured required ring

* “Full leaderboard metrics” will be implemented as:

  * richer mode-specific event payloads

  * richer `extra_stats` aggregation in `src/lib/stats.ts`

  * data-ready storage for future leaderboard/profile surfacing

  * no dedicated new leaderboard UI in this scope unless required by existing pages

* Spectator mode will reuse the same Darts room display/state rendering, with all scoring controls hidden.

* Undo will operate on the most recent locally tracked dart action and mark the most recent persisted `match_events` record undone via `undoLastEvent(match.id)`.

* Automatic match completion should update both:

  * `winner_profile_id`

  * `status = 'completed'`
    so the stats pipeline receives a correct winner.

## Proposed Changes

### 1. Refactor Darts runtime into board + engine architecture

**File:** `src/components/sports/DartsRoom.tsx`

Refactor the room from a countdown-only scorer into a controller component that:

* reads `variant` from `match.house_rules`

* chooses one runtime engine:

  * countdown engine

  * around-the-world engine

  * killer engine

* renders shared room chrome:

  * player header

  * current turn/dart slots

  * turn history

  * undo/miss/bull shortcuts

  * automatic winner banner

* renders a new interactive dartboard input area

Why:

* This preserves the existing route/component contract used by `MatchRoomPage` and `SpectatorPage`.

* It keeps shared Darts room UI together while isolating mode-specific state transitions.

Implementation shape:

* Add variant-specific state models within the Darts room or extract them to helpers.

* Keep a shared local action history structure so Undo can restore:

  * active player index

  * dart count in turn

  * per-player sub-mode state

  * winner state

* Remove the numeric free-entry input and current quick-score grid, replacing them with:

  * SVG board

  * Bull / D-Bull shortcuts

  * Miss

  * Undo

### 2. Add a reusable interactive SVG dartboard component

**New file:** `src/components/sports/DartsBoard.tsx`

Create a reusable SVG board component that renders:

* the 20 numbered radial segments

* ring zones for:

  * single outer

  * triple

  * single inner

  * double

* bull

* double bull

Behavior:

* Main numbered slice tap opens a floating contextual multiplier menu:

  * `Single`

  * `Double`

  * `Triple`

* Bull and D-Bull register directly without the multiplier menu.

* Each interactive zone should expose state-driven class hooks and data attributes, for example:

  * active target

  * valid target

  * invalid/dimmed

  * recently tapped

  * opponent target

  * self target

  * eliminated target

Suggested prop contract:

* `mode`

* `disabled`

* `pendingSegment`

* `highlightState`

* `onSegmentTap(segmentNumber)`

* `onBullTap()`

* `onDoubleBullTap()`

* `onMultiplierSelect(multiplier)`

* `onDismissMultiplier()`

Visual/interaction requirements:

* touch-friendly path hit areas sized for mobile

* pulse feedback on tapped segment

* fade/zoom transition on multiplier menu

* CSS hooks on SVG paths for engine-driven highlighting

Why:

* This separates geometry/touch logic from scoring rules and makes the board reusable across all Darts modes.

### 3. Add Darts geometry/constants helpers

**New file:** `src/components/sports/dartsBoardGeometry.ts`\
or\
**New file:** `src/lib/darts/board.ts`

Add board constants/helpers for:

* canonical Darts number order around the board

* segment metadata

* ring labels / score multipliers

* SVG arc/path generation

* segment identifiers such as:

  * `segment_20`

  * `segment_4`

  * `bull`

  * `double_bull`

Why:

* The board should not hardcode path math inline inside the room component.

### 4. Add engine helpers for mode-specific state transitions

**New files:**

* `src/lib/darts/countdownEngine.ts`

* `src/lib/darts/aroundTheWorldEngine.ts`

* `src/lib/darts/killerEngine.ts`

* optionally a shared type file: `src/lib/darts/types.ts`

Each helper should encapsulate:

* initial state creation from `match.house_rules` + `players`

* validation of a dart input

* state transition after a dart

* end-of-turn rotation after 3 darts

* win detection

* event payload generation

* undo snapshot compatibility

#### Countdown engine requirements

* Use existing rules:

  * `start_score`

  * `double_out`

* Support standard bust behavior.

* Preserve 3-dart turn rotation.

* Trigger win on exact zero, respecting double-out rule.

#### Around the World engine requirements

* Track each player’s current target progression:

  * 1 through 20

  * then Bull as the final target

* Use board hooks to:

  * pulse/highlight active player’s current target

  * dim the rest of the board

* Validation:

  * only hits matching the active target advance progress

* Progression:

  * if `skip_ahead_via_multiples = false`, any valid hit advances exactly 1 step

  * if `true`, single advances 1, double advances 2, triple advances 3

* Ring rule:

  * honor `ring_restriction = any_segment | doubles_only | triples_only`

  * for Bull, allow final completion only from bull hit

* Win condition:

  * player must advance through 20 and then successfully hit Bull

  * winner ends match immediately

#### Killer engine requirements

* Assign unique target numbers randomly at match start.

* Provide admin-only manual override UI before the first dart is recorded.

* Track per-player runtime state:

  * `targetNumber`

  * `lives`

  * `is_killer`

  * `is_eliminated`

* Phase 1:

  * active player is trying to hit their own assigned target

  * activation requires one valid hit in the configured ring:

    * `any_segment`

    * `doubles_only`

    * `triples_only`

* Phase 2:

  * once `is_killer = true`, highlight opponents’ targets on the board

  * hitting an opponent target removes 1 life from that opponent

  * hitting own target as a killer removes 1 life from self

* Eliminated players:

  * cannot take further turns

  * their targets should no longer be highlighted as active threats

* Win condition:

  * as soon as only one player remains with lives > 0, end match automatically

Why:

* These modes have materially different rule systems and state models; separate engine helpers keep `DartsRoom.tsx` manageable.

### 5. Add Darts-specific match completion helper

**File:** `src/lib/matches.ts`

Add a helper dedicated to automatic winner finalization, for example:

* `completeMatchWithWinner(matchId, winnerProfileId)`

Behavior:

* update `match_rooms` with:

  * `winner_profile_id`

  * `winner_team_id = null`

  * `status = 'completed'`

  * `updated_at`

* reuse the current stats-completion flow by invoking the same completion path used by `updateMatchStatus`

Why:

* The new Darts engines need automatic end-of-match behavior instead of relying on the manual match menu.

### 6. Expand Darts room UI for mode-specific overlays and panels

**File:** `src/components/sports/DartsRoom.tsx`

Add or replace UI sections to support:

* current player banner

* current dart slots (3 dart turn tracker)

* turn history with variant-aware summaries

* global controls:

  * Bull

  * D-Bull

  * Miss

  * Undo

* mode-specific info panels

#### Around the World panel

* show each player’s current target number / Bull status

* show active player focus clearly

#### Killer panel

* show assigned target number for each player

* show prominent lives tracker (heart icons or counters)

* show Killer status badge

* show eliminated state

* show pre-first-throw manual target override controls for admin

Why:

* The board alone is not enough; the room needs visible engine state so players know what counts.

### 7. Persist richer Darts event payloads

**Files:**

* `src/components/sports/DartsRoom.tsx`

* `src/lib/stats.ts`

Keep the existing event names where practical, but enrich payloads so all modes can be reconstructed/analyzed.

Planned event approach:

* countdown:

  * continue `darts_turn`

  * continue `darts_bust`

  * continue `darts_win`

  * add structured payload fields like:

    * `variant`

    * `throws`

    * `remaining_before`

    * `remaining_after`

    * `checkout`

    * `bust`

* around the world:

  * either reuse `darts_turn` / `darts_win` with `variant` + progression fields

  * or add explicit events such as:

    * `darts_atw_hit`

    * `darts_atw_turn`

    * `darts_atw_win`

* killer:

  * add explicit events such as:

    * `darts_killer_assignment`

    * `darts_killer_activate`

    * `darts_killer_hit`

    * `darts_killer_elimination`

    * `darts_killer_turn`

    * `darts_killer_win`

Recommended plan:

* keep countdown event names for backward compatibility

* use mode-specific explicit event names for Killer and Around the World

* ensure every event includes enough data to support:

  * local undo

  * career stat aggregation

  * future leaderboard/profile UI

### 8. Extend career stat aggregation for richer Darts metrics

**File:** `src/lib/stats.ts`

Expand Darts aggregation to consume the new event payloads and write richer `extra_stats` numbers.

Design targets:

#### Countdown metrics

* total darts thrown

* total points scored

* 180-equivalent / high-turn tracking if derivable

* bust count

* checkout count

* double-out finishes

* wins

#### Around the World metrics

* successful target hits

* missed attempts

* total advances

* bull finishes

* wins

* streak-ready counts

* efficiency-friendly raw counts for later ratios

#### Killer metrics

* activations earned

* opponent lives removed

* self-penalty hits

* eliminations secured

* times eliminated

* survival wins

* target-hit attempts and successes

#### Broadcast-ready analytics readiness

* Preserve raw counters needed later for derived metrics like:

  * target hit rate

  * average darts per progress step

  * killer elimination efficiency

  * clutch finishes

  * activation speed

Important constraint:

* Existing global ranking pages currently sort mainly by `season_points` and sport totals, so this scope should focus on correct storage/aggregation and not require a leaderboard UI rewrite.

### 9. Preserve spectator and TV display compatibility

**Files:**

* `src/components/sports/DartsRoom.tsx`

* possibly `src/pages/MatchRoomPage.tsx` only if context contract needs minor expansion

Requirements:

* spectator mode sees board highlights, state panels, and winner state, but no input controls

* TV display mode continues hiding interactive scoring controls while preserving visible board state

Why:

* The project already has TV and spectator pathways that should continue to work after the room refactor.

## Implementation Notes

* Prefer branching inside `DartsRoom` by `variant` rather than adding three separate room routes.

* Use a shared dart input model so all engines operate on a normalized throw object, for example:

  * `segment`

  * `ring`

  * `multiplier`

  * `baseValue`

  * `scoredPoints`

  * `isBull`

* For Around the World and Killer, “Miss” should still count toward the 3-dart turn limit even when it does not advance state.

* Undo should be disabled after automatic completion unless the match is reopened by an admin flow.

* Manual Killer target reassignment should be blocked once the first scoring event exists, to keep event/state consistency.

## Verification Steps

1. Start a Countdown Darts match and verify:

   * the static score grid is replaced by an SVG dartboard

   * tapping a numbered wedge opens a multiplier overlay

   * Bull / D-Bull / Miss work directly

   * 3 darts automatically rotate the turn

   * bust and checkout behavior still works

   * winner auto-completes the match and persists `winner_profile_id`

2. Start an Around the World match and verify:

   * the active player’s current target segment is highlighted/pulsing

   * non-target hits do not advance progress

   * optional skip-ahead by double/triple behaves correctly when enabled

   * the board dims non-relevant segments

   * after clearing 20, a bull hit wins immediately

3. Start a Killer match and verify:

   * players receive unique random targets

   * before the first throw, an admin can manually override targets

   * lives, target number, killer status, and elimination state are visible

   * valid own-target hit activates Killer under the configured ring rule

   * killer hits remove opponent lives

   * own-target self-hit as killer applies self-penalty

   * eliminated players stop taking turns

   * the final surviving player auto-completes the match

4. Verify Undo:

   * restores the previous local state snapshot

   * marks the most recent persisted event undone in Supabase

   * works across all three Darts variants before match completion

5. Verify spectator and TV display behavior:

   * spectators see board state/highlights but no controls

   * TV mode hides interactive controls while leaving board/status visible

6. Verify stats handoff:

   * completion still triggers `updateCareerStats`

   * new Darts events are aggregated without breaking existing sports

   * `player_career_stats.extra_stats` receives per-mode counters for countdown, around-the-world, and killer

7. Run project verification:

   * build/typecheck passes

   * manually smoke-test one completed match for each Darts variant

