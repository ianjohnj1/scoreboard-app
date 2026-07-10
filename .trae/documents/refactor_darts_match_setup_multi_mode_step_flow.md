## Summary

Refactor the Darts setup entry path in `src/pages/NewMatchPage.tsx` to match the existing Golf multi-step UX pattern: the main sport picker should open a dedicated Darts mode selection step, then the configuration step should render mode-specific Darts rules before continuing to the player selection stage.

This plan is intentionally scoped to setup flow only. The existing live Darts room (`src/components/sports/DartsRoom.tsx`) currently supports countdown scoring only, so `Around the World` and `Killer` will be selectable and persisted in match configuration, but no gameplay/runtime changes are included in this plan.

## Current State Analysis

- `src/pages/NewMatchPage.tsx`
  - `SPORTS` currently labels Darts as `Darts (501)` with countdown-only copy.
  - The setup `Step` union includes `sport | cricket_variant | golf_variant | config | players`.
  - Golf already uses a dedicated intermediate mode-selection step (`golf_variant`) with large list-style buttons and then branches the rules card in `config`.
  - Cricket uses the same pattern via `cricket_variant`.
  - Darts currently bypasses any intermediate sub-mode step and goes straight from `sport` to `config`.
  - `handleCreateMatch()` persists:
    - `house_rules` as the main rules payload.
    - `custom_config` for extra per-sport metadata such as `cricket_variant` and `golf_variant`.
- `src/components/sports/DartsRoom.tsx`
  - Reads `house_rules.start_score` and `house_rules.double_out`.
  - Has no support for `Around the World` or `Killer`.
- `src/pages/MatchRoomPage.tsx`
  - Uses `house_rules.variant` for sport-specific room branching, but only Golf currently switches room by variant.
- Reference images
  - The requested image files (`image_eff160.png`, `image_eff1bd.png`, `image_eff4a5.png`) were not found in the workspace during exploration.
  - The plan therefore uses the existing Golf step flow in `NewMatchPage.tsx` as the concrete source of truth for the requested UX pattern.

## Proposed Changes

### 1. Update Darts sport metadata in `src/pages/NewMatchPage.tsx`

- Change the Darts entry in `SPORTS`:
  - `label`: `Darts`
  - `desc`: `Standard countdown, elimination, or round-the-board mini games.`
- Keep icon and individual-player behavior unchanged.

Why:
- This aligns the top-level menu with the new sub-mode selection flow instead of implying 501 is the only Darts option.

### 2. Add Darts mode state and navigation wiring in `src/pages/NewMatchPage.tsx`

- Extend the `Step` union to include `darts_variant`.
- Add a new Darts mode state:
  - `const [dartsVariant, setDartsVariant] = useState<'countdown' | 'around_the_world' | 'killer' | null>(null);`
- Update back navigation:
  - `sport -> navigate(-1)`
  - `cricket_variant -> sport`
  - `golf_variant -> sport`
  - `darts_variant -> sport`
  - `config -> cricket_variant | golf_variant | darts_variant | sport` depending on selected sport
  - `players -> config`
- Update the header subtitle logic so `darts_variant` shows `Select Darts Mode`.
- Update sport selection click handling:
  - Cricket still routes to `cricket_variant`
  - Golf still routes to `golf_variant`
  - Darts routes to `darts_variant`
  - Other sports retain current behavior
- When entering Darts from the main sport list:
  - clear `cricketVariant` and `golfVariant`
  - clear `dartsVariant`
  - reset team/player pools the same way other non-team individual sports already do

Why:
- This creates the missing intermediate step while keeping existing branching behavior consistent across sports.

### 3. Add a dedicated `SELECT DARTS MODE` step in `src/pages/NewMatchPage.tsx`

- Insert a new branch alongside the Cricket and Golf variant sections:
  - heading text: `Select Darts Mode`
  - three full-width clickable option cards matching the existing Golf/Cricket structure
- Option mapping:
  - `501 / 301 Countdown`
    - internal id: `countdown`
    - subtext: `Classic countdown scoring with custom checkout rules.`
  - `Around the World`
    - internal id: `around_the_world`
    - subtext: `A chronological race to hit segments 1 through 20 and the Bullseye.`
  - `Killer`
    - internal id: `killer`
    - subtext: `Multiplayer elimination game. Become a killer to hunt your opponents' lives.`
- Each button should:
  - set `selectedSport` to `darts` if needed
  - set `dartsVariant`
  - reset `individualPlayers` to `[activeUser]` when available
  - seed `houseRules` with mode-specific defaults
  - advance to `config`

Default `houseRules` payload per mode:
- `countdown`
  - `variant: 'countdown'`
  - `start_score: 501`
  - `double_out: true`
- `around_the_world`
  - `variant: 'around_the_world'`
  - `skip_ahead_via_multiples: false`
  - `ring_restriction: 'any_segment'`
- `killer`
  - `variant: 'killer'`
  - `starting_lives: 3`
  - `killer_activation_ring: 'doubles_only'`

Why:
- This mirrors the Golf branch UX and ensures each mode enters config with the correct default rule state already loaded.

### 4. Make the Darts rules card dynamic in `src/pages/NewMatchPage.tsx`

- In the `config` step, replace the current Darts fallback text with a Darts-specific rules module that renders only when:
  - `selectedSport === 'darts'`
  - `dartsVariant` is set
- Update the Darts rules card title format to show the active mode label, for example:
  - `Darts (501 / 301 Countdown) Rules`
  - `Darts (Around the World) Rules`
  - `Darts (Killer) Rules`
- Directly below the title, add a muted informational text block containing the mode-specific summary:
  - `countdown`:
    - `Players start with a set score and race to reduce it to exactly 0. Each player gets 3 throws per turn. If a throw drops the score below 0 (or to 1 if Double-Out is on), the turn is a Bust and resets.`
  - `around_the_world`:
    - `A chronological race around the dartboard. Every player starts targeting segment 1 and cannot advance to the next number until it is successfully hit. The first player to hit all segments up to 20 and finish on the Bullseye wins.`
  - `killer`:
    - `Each player must first hit their assigned number segment (or specific ring) to activate 'Killer' status. Once achieved, you score points by hitting your opponents' segments to eliminate their lives. Last player standing wins.`

Rules UI to render by mode:

- `countdown`
  - Start Score Selector:
    - use the existing segmented-button style already present in Golf hole-count buttons
    - options: `301`, `501`
    - default: `501`
    - writes to `houseRules.start_score`
  - Enforce Double-Out:
    - use `RuleToggle`
    - label: `Enforce Double-Out`
    - default: `true`
    - writes to `houseRules.double_out`

- `around_the_world`
  - Skip Ahead via Multiples:
    - use `RuleToggle`
    - label: `Skip Ahead via Multiples`
    - default: `false`
    - writes to `houseRules.skip_ahead_via_multiples`
  - Ring Restriction:
    - add a small reusable select-row helper in this file or render inline
    - options:
      - `Any Segment` -> `any_segment`
      - `Doubles Only` -> `doubles_only`
      - `Triples Only` -> `triples_only`
    - default: `any_segment`
    - writes to `houseRules.ring_restriction`

- `killer`
  - Starting Lives:
    - use `RuleNumber` with clamped bounds
    - label: `Starting Lives`
    - range: `1..10`
    - default: `3`
    - writes to `houseRules.starting_lives`
  - Target Ring to Become Killer:
    - use the same select-row helper/inline select
    - options:
      - `Any Segment` -> `any_segment`
      - `Doubles Only` -> `doubles_only`
      - `Triples Only` -> `triples_only`
    - default: `doubles_only`
    - writes to `houseRules.killer_activation_ring`

Why:
- This gives Darts the same dynamic configuration experience Golf already has, while keeping styling changes out of scope.

### 5. Clamp numeric controls for Killer lives in `src/pages/NewMatchPage.tsx`

- Update `RuleNumber` to support optional `min` and `max` props.
- Preserve existing current behavior for callers that do not pass bounds.
- Use `min={1}` and `max={10}` for Killer starting lives.

Why:
- The requested Darts rules require a bounded counter, and extending the existing helper is the smallest change.

### 6. Persist Darts sub-mode cleanly in `handleCreateMatch()` within `src/pages/NewMatchPage.tsx`

- Continue using `house_rules` as the authoritative rules payload.
- Persist the Darts mode in both places:
  - `house_rules.variant = dartsVariant` for consistency with the existing per-sport variant pattern
  - `custom_config.darts_sub_mode_id = dartsVariant` to satisfy the explicit `sub_mode_id` requirement
- Preserve current sport-specific payloads for Cricket, Golf, and Custom.

Planned `handleCreateMatch()` shape:
- `house_rules`
  - spread `houseRules`
  - `variant` becomes:
    - Cricket: `cricketVariant`
    - Golf: `golfVariant`
    - Darts: `dartsVariant`
    - otherwise `null`
  - `course_data` and `holes` remain Golf-only
- `custom_config`
  - Custom sport keeps current custom config payload
  - Non-custom sports become:
    - `cricket_variant: cricketVariant || null`
    - `golf_variant: golfVariant || null`
    - `darts_sub_mode_id: dartsVariant || null`

Why:
- This keeps setup state available both generically (`house_rules.variant`) and explicitly (`darts_sub_mode_id`) without introducing schema changes.

### 7. Keep runtime behavior unchanged outside setup

- No planned edits to:
  - `src/components/sports/DartsRoom.tsx`
  - `src/pages/MatchRoomPage.tsx`
  - `src/pages/SpectatorPage.tsx`
- Resulting behavior after this plan:
  - Countdown Darts continues to work with existing room logic.
  - Around the World and Killer selections are stored in match configuration for future runtime support.

Why:
- This matches the chosen scope for this plan and avoids silently expanding into gameplay implementation.

## Assumptions & Decisions

- Approved scope decision: `Setup only`.
- No theme or styling refactor is included; the implementation should reuse the current Golf/Cricket selection-card and config-card visual patterns.
- No database migration is needed because the new mode id and rules can live inside existing JSON columns (`house_rules`, `custom_config`).
- `sub_mode_id` will be represented as `custom_config.darts_sub_mode_id`.
- The generic per-sport variant field remains `house_rules.variant`.
- Internal Darts mode ids will be:
  - `countdown`
  - `around_the_world`
  - `killer`
- Select/dropdown enum ids will be:
  - `any_segment`
  - `doubles_only`
  - `triples_only`
- Since the reference images were not present locally, the exact UX structure will be matched to the existing Golf step flow already implemented in `NewMatchPage.tsx`.

## Verification Steps

1. Open `New Match` and verify the Darts card now reads:
   - `Darts`
   - `Standard countdown, elimination, or round-the-board mini games.`
2. Click `Darts` and verify a new `Select Darts Mode` step appears before configuration.
3. Verify all three options render with the requested labels and subtext.
4. Choose `501 / 301 Countdown` and confirm:
   - config title reflects countdown mode
   - info block shows the countdown summary
   - `301/501` selector defaults to `501`
   - `Enforce Double-Out` defaults to on
5. Choose `Around the World` and confirm:
   - info block shows the correct summary
   - `Skip Ahead via Multiples` defaults to off
   - `Ring Restriction` defaults to `Any Segment`
6. Choose `Killer` and confirm:
   - info block shows the correct summary
   - `Starting Lives` defaults to `3`
   - counter cannot go below `1` or above `10`
   - `Target Ring to Become Killer` defaults to `Doubles Only`
7. Verify back navigation works:
   - `config -> darts_variant`
   - `darts_variant -> sport`
8. Verify `Continue to Players` preserves the selected Darts mode and its current rules in local state.
9. Create one match per Darts mode and verify the inserted payload includes:
   - `house_rules.variant`
   - the relevant Darts rule keys for that mode
   - `custom_config.darts_sub_mode_id`
10. Sanity check that existing Cricket, Golf, and standard Darts countdown flows still create matches successfully.
