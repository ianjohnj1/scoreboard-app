# Sport room template

How to build a new sport room, or bring an existing one up to par, using
`ChipOffRoom.tsx` as the reference implementation. `ChipOffRoom` is the most
complete room in the app (delta-synced live sync, guarded writes, full win
condition, team + solo modes, rematch flow) — copy its shape rather than one
of the thinner rooms (`CardsRoom`, `TableTennisRoom`, `BasketballRoom`,
`DartsRoom`, `CustomRoom`), which `todo.md`'s P1 list already tracks as
needing this same work. `PoolRoom` (the `16_ball`/`8_ball` ball-tracking
room, added 2026-08-01) is already built to this standard — see its own
reducer at `src/lib/pool/poolEngine.ts` for how the pattern extends to a
sport with real rule branching (group assignment, turn rotation, win
detection) rather than a flat score total.

A ready-to-copy skeleton implementing everything below is at
[`src/components/sports/_TemplateRoom.tsx`](../src/components/sports/_TemplateRoom.tsx).
It's prefixed `_` and deliberately wired into no dispatch table — copy it to
a real filename and follow the wiring checklist at the bottom.

## The five things every complete room does

Read `CLAUDE.md`'s "Sport rooms" and "Matches are event-sourced" sections
first — this doc is the how, that's the why.

### 1. Rehydrate and live-sync via `useMatchEvents`

Every sport without a normalized side table (i.e. everything except cricket
and golf) must derive its displayed state from `match_events`, not from
local component state alone — otherwise a mid-match refresh shows 0-0.

```ts
const { events, loading: eventsLoading, refresh: refreshEvents } = useMatchEvents(match.id);
```

Then derive all displayed state from `events` with a `useMemo`, the way
`ChipOffRoom`'s `gameStats` does — walk the event list once, accumulate
per-player totals, and derive "whose turn is it" from the last event plus
today's roster (not a replayed turn counter), so a roster change mid-match
can't desync turn order.

Don't write a new `loadEvents` + `.channel('postgres_changes')` pair by
hand — `useMatchEvents` already solves fetch, delta-sync-by-`sequence_num`,
and the reconnect-safety resync-on-`SUBSCRIBED` callback in one hook. See
`src/hooks/useMatchEvents.ts` and the Realtime section of `CLAUDE.md`.

### 2. Guard every write inside the handler, not just the JSX

```ts
const canInteract = match.status === 'active' || isAdmin;

const handleScore = async (...) => {
  if (!currentPlayer || loading || eventsLoading || isSpectator || !canInteract) return;
  // ...
};
```

`canInteract` must be checked *inside* the function that calls
`recordEvent`/`undoLastEvent`, not only used to disable a button. A
2026-07-30 audit found five rooms where pausing a match via the header menu
(independent of the room's own UI state) let scoring continue anyway,
because the guard only existed as a disabled prop on a button. Never use
`match.status !== 'completed'` as an "is this live" check — it's also true
while `'paused'`.

### 3. Respect `isSpectator` / `isTvDisplayMode`

Both must disable all input and show a read-only summary/leaderboard view
instead of the scoring pad. `ChipOffRoom` branches its whole main content
area on `(gameStats.isGameOver || match.winner_profile_id || match.winner_team_id || isSpectator || isTvDisplayMode)`.

### 4. Call an explicit win condition

When the match's win condition is met, call `completeMatchWithWinner(matchId, winnerProfileId)`
(solo) or `completeMatchWithTeamWinner(matchId, winnerTeamId)` (team), then
`ctx.onRefresh()`. Without this, `match.winner_profile_id`/`winner_team_id`
never gets set and lifetime `matches_won`/`matches_lost` counters stay 0
forever, even though the match visibly ended — `PoolFramesRoom` (the legacy
frame-tally fallback for pool matches with no `variant` set) has exactly
this bug today: no win-condition logic at all, can only be closed via the
generic "End & Lock" header action, which assigns no winner. It's not on
the "bring up to standard" list below because it's a dead-end fallback, not
a room new matches ever route to — see `PoolRoom` (the `16_ball`/`8_ball`
room) for the fixed version of the same sport.

Golf is the one deliberate exception: classic golf has no win-condition
button, so `determineAndSaveWinnerIfMissing()` backfills it as a
completion-time fallback. Don't copy that pattern into a new sport — call
the winner functions explicitly from the room instead.

### 5. Route events so they actually count toward the leaderboard

`match_event_points()` (Postgres) and the `leaderboard_match_player_scores`
view credit an event to a player via, in order: `player_id` on the row,
else an `event_data.player` roster index, else `team_id`. **An event with
none of the three is silently dropped and scores nothing.** Always pass
`playerId` to `recordEvent()` when the event has an individual scorer, even
in a team event:

```ts
await recordEvent(match.id, 'my_sport_score', { points }, currentPlayer.id, currentTeamId, currentUser?.id);
//                                                          ^^^^^^^^^^^^^^^ don't omit this
```

`cards_round`, `tt_set`, and non-team `custom_score` all currently violate
this (tracked in `todo.md`) — don't add a fourth. If you add a genuinely
new `event_type`, it also needs a `WHEN` branch in `match_event_points()`
(a migration) before it scores anything — see `CLAUDE.md`'s Stats pipeline
section.

## Other things ChipOffRoom does that are worth copying

- **Rematch**: clone `match_rooms` + `match_teams` + `match_players` into a
  fresh room with a new `generateRoomCode()`, `navigate()` to it. Copy
  `ChipOffRoom`'s `handleRematch` almost verbatim — the team-ID remapping
  (`teamIdMap`) is easy to get subtly wrong from scratch.
- **Undo**: a single "Undo Last Shot/Point" button calling `undoLastEvent(match.id)`
  then `refreshEvents()`, guarded the same way as scoring.
- **Team vs solo derived from `house_rules`**, not a separate `sport` value
  — e.g. `const isTeamMode = Boolean(rules.team_play) && teams.length >= 2`.
  Turn rotation interleaves each team's lineup by position so uneven roster
  sizes degrade gracefully rather than erroring.
- **`SAFE_PROFILE_COLUMNS`** — never `select('*')` on `profiles` anywhere in
  a new room; the revoked `pin_hash` column fails the whole query.

## Wiring checklist — adding a brand new sport or variant

`CLAUDE.md` calls this out as touching four places that can silently drift
(a missing one doesn't error — spectator view just falls back to
`CustomRoom`):

1. `getSportRoom()` in `src/pages/MatchRoomPage.tsx`
2. the `sportRooms` map **and** the golf-variant `if`/`else if` chain in
   `src/pages/SpectatorPage.tsx`
3. `getSportIcon()` / `getSportLabel()` in `src/lib/matches.ts`
4. the `SPORTS` array (and any variant sub-step) in `src/pages/NewMatchPage.tsx`

If it's a new `event_type` rather than a new sport shell, also add:

5. a `WHEN` branch in the `match_event_points()` Postgres function
   (migration) — plus a new column in `event_totals` in
   `leaderboard_match_player_scores` if it feeds a counter other than
   `points` (e.g. golf's `hio`/`strokes`).

## Bringing an existing thin room up to this level

For `DartsRoom`, `CustomRoom`, `TableTennisRoom`, `BasketballRoom`,
`CardsRoom` (the `todo.md` P1 list): the fix is the same five-point
checklist above applied in place, not a rewrite from scratch. Concretely,
per room:

- Swap the room's ad-hoc `match_events` fetch (if any) and any hand-rolled
  `.channel(...)` subscription for `useMatchEvents(match.id)`.
- Move any `isSpectator`/`isTvDisplayMode`/`canInteract` check that
  currently lives only in JSX (`disabled={...}`) into the top of the
  handler function itself.
- Add an explicit win condition calling `completeMatchWithWinner`/
  `completeMatchWithTeamWinner` if the sport doesn't have one yet.
- Check every `recordEvent()` call passes `player_id` for individually
  attributable events (see point 5 above) — `CardsRoom.tsx:41`,
  `TableTennisRoom.tsx:71`, and `CustomRoom.tsx:42` are the three known
  offenders.

Do these one room at a time with real browser-preview QA per sport
(`CLAUDE.md`'s testing story has no component/e2e coverage, so this is
still manual) rather than as one large multi-sport change — each sport's
scoring rules are different enough that a shared refactor risks silently
changing gameplay in a sport nobody was looking at.
