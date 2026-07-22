# Plan: PvP Room Turn Refinement + Ball Counter + Match Summary

## Summary

Refine the PvP (Putt vs Putt) match room to match the updated turn-taking rules:

- Shared pool starts at the configured value (not doubled).
- Each active player takes **N attempts where N = current pool size at the start of their turn**.
- Next team’s active player then takes the remaining pool size (shrunk by any holed balls).
- Add a Chip-Off-style per-turn ball/attempt counter.
- Handle match completion and post-match summary the same way Chip Off (and other rooms) do: match-complete summary UI plus rematch/dashboard actions.

## Current State Analysis (Grounded)

- PvP room is implemented in [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx).
  - Current turn logic alternates every *single* `putt_attempt` event (`totalAttempts % 2`) and selects the active player by per-team attempt count.
  - Pool is currently computed as `startingBallsPerTeam * 2 - holedCount`, which assumes “per team” semantics.
  - There is no Chip-Off style per-turn attempt counter.
  - Completion UI is a small winner overlay; it does not provide Chip-Off-style “Match Complete” summary + rematch/dashboard controls.
- Chip Off provides the desired UX patterns:
  - “Balls/Turn” dot counter and “Ball X/Y” indicator in [ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx#L278-L324).
  - Post-match summary surface with Rematch/Dashboard actions in [ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx#L328-L389).

## Decisions (From This Spec)

- **Pool Start**: Configured total (e.g. 5 total balls).
- **Turn Length**: A player takes `poolSizeAtTurnStart` attempts for that turn.
- **Ball Counter**: Dot indicator represents attempts within the current player’s turn (Chip-Off style).

## Proposed Changes

### 1) PvP Turn Engine (Derived From Events)

- File: [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
- What:
  - Replace the current “alternate every attempt” model with a derived “turn block” model.
  - A “turn” is a block of `putt_attempt` events attributed to one active player, where block length is determined by pool size at the start of that turn.
- How (pure derivation; no new DB tables):
  - Initialize:
    - `pool = startingBallsConfigured`
    - `teamTurnIndex = 0` (team 1 starts)
    - `teamPlayerIndex[teamId] = 0` (looping lineup)
    - `turnAttemptsTarget = pool` (pool at start of turn)
    - `turnAttemptIndex = 0`
  - Iterate events in sequence order:
    - For each `putt_attempt`:
      - `turnAttemptIndex++`
      - If outcome is `holed`, `pool--`
      - If `turnAttemptIndex >= turnAttemptsTarget`:
        - switch team (`teamTurnIndex = 1 - teamTurnIndex`)
        - advance that team’s player index (`(idx + 1) % lineup.length`, but keep stable if lineup length is 1)
        - reset `turnAttemptIndex = 0`
        - set `turnAttemptsTarget = pool` (pool at start of new turn)
    - Stop early if `pool <= 0` (match should be complete/tie-break).
  - Derived outputs:
    - active team + active player
    - attempt index within turn
    - attempts target for the current turn (used by dot counter)
    - pool remaining

### 2) Pool Semantics Update (Configured Total)

- Files:
  - [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
  - [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)
  - [ruleDefinitions.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/data/ruleDefinitions.ts)
- What:
  - Treat `house_rules.starting_balls_per_team` as “starting balls (shared pool total)” for PvP.
  - Update the UI copy so the name matches the new mechanic (to avoid “why isn’t it doubled?” confusion).
- How:
  - PvP runtime: change pool initialization from `startingBallsPerTeam * 2` to `startingBallsPerTeam`.
  - Setup UI label: change “Starting Balls Per Team” to “Starting Balls” for PvP variant only, while keeping the stored key for backward compatibility.
  - Rule definition explain text: update `putt_vs_putt.starting_balls_per_team` label/explanation accordingly.

### 3) Add Chip-Off Style Attempt Counter

- File: [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
- What:
  - Add a dots UI matching Chip Off’s “Balls/Turn” counter, but representing “Attempts this turn”.
  - Add a “Attempt X/Y” indicator for the current player.
- How:
  - Render dots `Array.from({ length: turnAttemptsTarget })` and fill those `< turnAttemptIndex`.
  - Keep existing “Pool Remaining” tile, but rename “Shared Pool Remaining” → “Balls Remaining” for clarity under new semantics.

### 4) Match Completion + Post-Match Summary (Chip-Off Style)

- File: [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
- What:
  - Replace the current minimal overlay with a Chip-Off style match-complete surface:
    - Winner banner
    - Team leaderboard (team scores + attempts)
    - Rematch and Dashboard buttons for non-spectators
  - Keep the tie-break modal, but make the post-match summary the authoritative end state after completion.
- How:
  - Use `match.status === 'completed' || match.winner_team_id` as the UI gate to show summary.
  - When pool hits 0:
    - If tied: open `TieBreakerChallenge` (existing)
    - Else: call `completeMatchWithTeamWinner()` (existing)
  - Rematch:
    - Implement a PvP rematch function similar to Chip Off, but:
      - Create new `match_rooms` with `sport='golf'`, `house_rules.variant='putt_vs_putt'`, and the same PvP rules
      - Create `match_teams` and `match_players` (including `team_id` and `lineup_order`)
      - Generate a secure `room_code` using the same UUID-segment approach as `NewMatchPage.tsx` (do not use `Math.random()`).

### 5) Post-Match Summary Data

- File: [PvPRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/PvPRoom.tsx)
- What:
  - Show at minimum:
    - Team score (holed putts)
    - Team attempts
    - Winning team (or “Tie-break winner” after tie-break)
  - Optionally show per-player breakdown (attempts + holed) if it fits the existing card layout without clutter.
- How:
  - Derive from `putt_attempt` events:
    - `teamScore = count(outcome='holed' and team_id=...)`
    - `teamAttempts = count(team_id=...)`
    - optionally per player: same counts grouped by `player_id`

## Assumptions & Compatibility

- PvP remains event-driven and reconnect-safe, derived from persisted `match_events`.
- No new event types are required for this refinement; existing `putt_attempt` and `tiebreak_result` remain sufficient.
- The migration that adds `match_players.lineup_order` remains required for real DB writes; if PostgREST schema cache errors recur, the schema reload procedure remains valid.

## Verification Steps

1. **Turn order correctness**
   - Start PvP match with starting balls = 5
   - Confirm Team 1 Player 1 receives 5 attempts (dot counter shows 1/5..5/5)
   - If Team 1 holes X balls, confirm Team 2 Player 1 receives (5 - X) attempts next
   - Confirm next is Team 1 Player 2, then Team 2 Player 2, looping back after lineup end
2. **Ball counter**
   - Dots advance per recorded attempt
   - Dots reset at team switch; count equals pool size at that moment
3. **End-of-match**
   - When pool reaches 0, match completes (or tie-break triggers)
   - Post-match summary renders with winner + rematch/dashboard actions
4. **No regressions**
   - Spectator view shows the correct current player and counters
   - Undo works across turn boundaries
   - Dashboard and other sports remain unaffected

