# TODO

Tracks known gaps, unresolved tech debt, and planned features for this app.
`CLAUDE.md` documents what's already true of the code; completed fixes and
the incidents behind them live in [docs/fix-history.md](docs/fix-history.md)
instead of here — this file only carries forward-looking intent, so it
stays short. Update it directly as scope changes.

Items below are ordered by what blocks the scaling goal, not by type. Each
one says what's wrong, where, and what the fix is.

## Scaling goal — stable and responsive at 100+ users

Target: 100 active users with sub-second page loads, on a footprint that can
grow further without a rewrite. Measured baseline from the 2026-07-30
architecture audit against the live project (`henoedqzusmnxtxdsyuc`, free
plan, Sydney):

| Metric | Measured |
|---|---|
| Events per match (avg / max) | 163 / 453 |
| Players per match | ~5 |
| `match_events` row — JSON / gzipped wire / on-disk with indexes | 444 B / 42 B / ~700 B |
| Full event pull (959 rows, Sydney) | 142 ms |
| Free-plan limits | 5 GB egress/mo, 500 MB DB, 200 peak realtime conns, 60 Postgres conns |

The ceiling is driven by **cumulative match history, not concurrent users** —
nothing prunes or caches, so it arrives with time even at flat user count. At
20 users playing ~8 matches/week that's ~400 matches/year, which reaches the
degradation zone in about a year with zero growth.

**The four P0 items below are all done, and so is the `rpc_login`
account-takeover hole** (the one item that needed zero user growth to
matter) — see [docs/fix-history.md](docs/fix-history.md) for what shipped
and how each was verified. **What's left before 100 users is the P1 list
below.**

## P0 — blocks 100 users

All four done as of 2026-07-30 (leaderboard compute, leaderboard payload,
sport-tab refetching, `sequence_num` write race) — full write-up in
[docs/fix-history.md](docs/fix-history.md#performance--scaling--p0-2026-07-30).

## P1 — needed at or before 100 users

- **Three sports never score at all, because their events can't be routed.**
  Found while porting the reduction to SQL (2026-07-30). The leaderboard
  credits an event to a player via `player_id`, else an `event_data.player`
  roster index, else `team_id` — and an event with none of the three is
  silently dropped. `cards_round` (`CardsRoom.tsx:41`) passes no player, no
  index and no team; `tt_set` (`TableTennisRoom.tsx:71`) sends `winner`, not
  `player`; non-team `custom_score` (`CustomRoom.tsx:42`) puts the profile id
  in `event_data.entityId` where nothing reads it. So cards scores, table
  tennis set wins, and solo custom-game scores contribute nothing to season
  points. The SQL view reproduces all of this deliberately rather than
  changing behaviour mid-refactor. Fix is in the rooms, not the view: pass
  `player_id` on the `recordEvent()` call. Note that fixing it will
  retroactively change season points for any existing match of those sports.
  (`pool_frame` was the fourth case here — routed fine via `team_id` but had
  no scoring branch at all; fixed 2026-08-01, see fix-history.md, no
  retroactive impact since no pool match has ever been played.)
- **Cards, Table Tennis, and Basketball rooms are minimally built compared
  to Golf and Cricket.** No explicit win-condition logic, so none of them
  call `completeMatchWithWinner()`/`completeMatchWithTeamWinner()` the way
  every other team sport does — `match.winner_team_id` never gets set and
  `matches_won`/`matches_lost` lifetime counters always read 0 regardless of
  the in-room score (a match can only be closed via the generic "End & Lock"
  action, which never assigns a winner). Not yet individually audited beyond
  that. **Pool no longer has this gap** — `PoolRoom.tsx` (added 2026-08-01,
  `16_ball`/`8_ball` variants) has explicit win detection and calls
  `completeMatchWithWinner`/`completeMatchWithTeamWinner`; the old frame-tally
  behaviour lives on as `PoolFramesRoom.tsx`, used only as a fallback for
  matches with no `house_rules.variant` (none are created that way anymore).
  Bringing the remaining three rooms up to Golf/Cricket's level of
  completeness (explicit win conditions, proper stat tracking) would resolve
  this and likely several of the routing quirks above as a byproduct, rather
  than patching each symptom separately.
  [docs/sport-room-template.md](docs/sport-room-template.md) (added
  2026-08-01) writes up what "complete" means as a checklist against
  `ChipOffRoom`, plus a copy-ready skeleton at
  `src/components/sports/_TemplateRoom.tsx` — use it rather than
  re-deriving the pattern per room.
- **`DartsRoom` and `CustomRoom` never rehydrate from `match_events`, and
  none of the remaining non-side-table rooms sync live across devices.**
  CLAUDE.md requires every sport without normalised side tables to
  rehydrate from `match_events`, and TableTennis/Basketball/Cards all
  do on mount — Darts and Custom only ever *write* (`recordEvent` at
  `DartsRoom.tsx:182`), with state coming from `buildInitialState(...)`.
  Refreshing mid-501 resets the score to the start. Darts is the most
  stateful sport in the app, so this is the worst room to have it in.
  Confirmed bug, not a scaling issue — but at 100 users it stops being rare.
  **Re-checked 2026-08-01 while building the delta-sync hook mentioned
  next: it's worse than previously scoped** — TableTennis, Basketball,
  and Cards rehydrate on mount but have no realtime
  subscription at all (no `.channel(` in any of the three files), so a
  second device never sees a live score update for any of these five
  sports, not just Darts/Custom. (`PoolRoom.tsx`, the `16_ball`/`8_ball`
  room added 2026-08-01, is fully solved via `useMatchEvents` — rehydration,
  live cross-device sync, and reconnect safety all in one hook, no gap left.)
  Fix mechanism now exists and doesn't need to be built per-room:
  `useMatchEvents()` (`src/hooks/useMatchEvents.ts`, added 2026-08-01, see
  `docs/fix-history.md`) already solves rehydration + live cross-device
  sync + reconnect safety in one hook, proven out in `ChipOffRoom`/
  `PvPRoom`/`PoolRoom`. Wiring the remaining five rooms onto it (as part of
  bringing them up to Golf/Cricket's completeness generally, see the item
  above and [docs/sport-room-template.md](docs/sport-room-template.md))
  closes this without reinventing the fetch/subscribe logic per room.
- **Unfiltered global realtime subscriptions.** `fanboy-live` in
  `LeaderboardPage.tsx` listens to *every* comment INSERT app-wide; the
  leaderboard and `ProfilePage` both listen to every completed match. Fan-out
  is linear in concurrent users against a 200-connection / 2M-message-per-month
  free-plan budget. Fix: scope the filters, or poll on an interval for the
  fan-engagement widget.
- **`deleteMatch()` is ten sequential non-transactional round trips.** A
  failure partway leaves orphans, and `comments` is polymorphic with no FK to
  catch it. Fix: one `SECURITY DEFINER` RPC doing the whole teardown in a
  transaction.

*Done this session, full detail in fix-history.md: the `rpc_login`
account-takeover hole and its scoped recovery fallback, `rpc_login` rate
limiting, `active_sessions` garbage collection, and unlimited profile
creation.*

## P2 — headroom beyond 100 users

- **Every SELECT policy is `USING (true)`.** The anon key ships in the client
  bundle, so anyone can read every profile, match, event, and comment. A
  deliberate call for a mates' scoreboard; a blocker for any public or
  multi-group audience. Decide which way this app is going before building on
  top of it — scoping reads later means revisiting every list page, and it
  interacts with the VOLATILE-helper item above. It's also why `rpc_login`'s
  rate limiting (fix-history.md) only stops brute-forcing one known
  username, not a low-and-slow scan across many.
- **66 "multiple permissive policies" advisor warnings.** Postgres ORs
  permissive policies and evaluates every one, so duplicates are a per-row
  function call each. Worst on `cricket_innings` (24), `cricket_player_stats`
  (15), and `golf_scores` (13). Consolidate per command.
- **Index bloat on the hot append-only table.** `match_events` carries seven
  indexes (`pkey`, `match_id`, `player_id`, `recorded_by`, `sequence`,
  `team_id`, and the `match_id + sequence_num` unique), all maintained on
  every scored event — all seven are genuinely used (checked live via
  `pg_stat_user_indexes`), so no drops there. Of the 29 other indexes
  flagged `idx_scan = 0` project-wide, checked each individually
  (2026-08-01): one, `idx_match_rooms_room_code`, was a true duplicate of
  the `room_code` unique constraint's own index and was dropped
  (`20260731211556`). The other 17 are FK-support indexes deliberately
  added by `20260726044100_perf_hardening_fk_indexes_and_rls.sql` ("cover
  every foreign key with an index... none of these tables are large yet")
  — 0 scans just reflects that those tables are still small enough for
  seq scans and that FK-constraint checks don't register as `idx_scan` the
  same way query filters do. Leave them; dropping them now would undo
  intentional scaling prep, not remove cruft.
- **`profiles.user_id` is a dead column.** FK to `auth.users(id) ON DELETE
  SET NULL`, 100% NULL across all rows, never referenced anywhere in the
  app — a leftover from before the app moved to custom PIN auth (no
  Supabase Auth is used at all now). Its index (`idx_profiles_user_id`)
  was left alone in the cleanup above since dropping the column itself is
  a schema-shape decision, not an index question. Worth a separate call:
  drop the column (and its FK/index) once confirmed nothing latent depends
  on `auth.users` linkage.
- **`player_career_analytics` scans all players before filtering.** Its
  `player_match_status` CTE joins every `match_players` row against every
  completed match, then filters to one profile — a full scan per profile-page
  view. Push the `profile_id` predicate into the CTE.
- **Single 619 KB JS bundle (162 KB gzipped), no route splitting.** Every
  route, every sport room, and the darts board geometry load on first paint.
  Fix: `React.lazy` per route, and per sport room in `getSportRoom()`.
- **No stats retention or archival strategy.** Even with server-side
  aggregation, raw `match_events` grows forever at ~700 B/row on disk
  (~4,300 matches to fill the free plan's 500 MB). Decide whether completed
  seasons get rolled up and their events archived.

## Known gaps (not scaling-related)

- **Match deletion is admin-only, even for the creator.** Currently by
  design (see `deleteMatch()` in `src/lib/matches.ts`), but worth revisiting
  — a creator may reasonably expect to delete their own not-yet-played match.
- **Test suite gaps.** Vitest + two pgTAP files exist — see CLAUDE.md's
  Testing section for what's covered and how to run them (write-up of how
  they were built in fix-history.md). Still open, in rough priority order:
  - **`getGlobalLeaderboardData()`'s reduction loop** (placement, milestone
    SP, chip-off team ordering) is untested — tightly coupled to chained
    Supabase calls, so testing it means either extracting the reduction
    into a pure function or building a fake PostgREST client.
  - **`rls_smoke.test.sql` covers two bug classes on a handful of tables,
    not the full RLS surface.** Most policies (`match_teams`, `comments`,
    cricket/golf side tables, …) still have no test at all.
  - **No component/e2e tests and no CI.** The manual browser-preview QA
    loop is still the only verification for anything UI-facing, and
    `npm test` isn't wired into any CI check yet (there is no CI).
  - **Neither pgTAP file runs automatically anywhere** — no local Supabase
    stack, no CI. Next step is deciding where they run on a recurring
    basis (local Docker stack vs. a Supabase branch vs. CI), not writing
    more assertions.
- **Sport/variant dispatch tables can drift silently.** Adding a sport or
  variant touches four places (`getSportRoom()` in `MatchRoomPage.tsx`; the
  `sportRooms` map *and* golf-variant branch in `SpectatorPage.tsx`;
  `getSportIcon()`/`getSportLabel()` in `lib/matches.ts`; `NewMatchPage.tsx`).
  Missing one doesn't error — spectator view just silently falls back to
  `CustomRoom`. No lint rule or test currently catches this.

## Future features

- **Pool: leaderboard/season-points wiring for the new `16_ball`/`8_ball`
  event types is done** (`20260801124346_score_pool_ball_tracking_events.sql`)
  — `pool_ball_potted` scores 1 point when `own_ball` is true,
  `pool_game_won` is a flat 7-point winner bonus (proof it always outranks
  the loser is in the migration comment), `pool_miss`/`pool_foul` score 0.
  Verified live via the pgTAP harness (51/51,
  `supabase/tests/database/match_event_points.test.sql`) and confirmed zero
  retroactive impact (no live `pool_ball_potted`/etc. rows existed yet).
  **Win % when Bigs vs win % when Smalls, and win % when broke first are also
  done** (`20260801133346_pool_group_and_break_stats.sql`, 2026-08-01) — the
  `leaderboard_match_player_scores` view gained `pool_group` (read off the
  match's first non-8 `pool_ball_potted` event's `event_data.group`, fanned
  to the opposite roster side; `NULL` for both sides if the table never
  legally opened, or for legacy `pool_frame`-only matches) and
  `pool_broke_first` (whoever owns the match's earliest live
  `pool_ball_potted`/`pool_miss`/`pool_foul` event, since side 0 always shoots
  first). `GlobalPlayerStats` in `stats.ts` tallies
  `pool_matches_as_bigs`/`pool_wins_as_bigs`,
  `pool_matches_as_smalls`/`pool_wins_as_smalls`, and
  `pool_matches_broke_first`/`pool_wins_broke_first`; `LeaderboardPage.tsx`'s
  Pool tab renders all three as win percentages. Verified via a synthetic
  `execute_sql` transaction (individual-mode legal win, illegal-early-black
  edge case, team mode), always rolled back — zero retroactive impact, no
  live pool match data exists yet. See `STATS_AUDIT_LOG.md`'s Pool section
  for the full calculation write-up.
  **The remaining not-yet-implemented list (Fouls, Average Shots per Pot,
  Wire-to-Wire Wins, Longest Pot Streak, Shortest Win, Bigs/Smalls assignment
  counts) is also done** (`20260801211316_pool_career_analytics.sql`,
  2026-08-01) — added to `player_career_analytics` instead of
  `leaderboard_match_player_scores`, since that's the view `ProfilePage.tsx`
  actually reads (the win-% stats above only ever reached `LeaderboardPage`).
  Fouls/shots/wire-to-wire are plain per-player counts over the three
  shot-producing event types; Shortest Win mirrors golf's `best_score_classic`
  personal-best pattern; Bigs/Smalls counts and the win-% stats are joined in
  from `leaderboard_match_player_scores`'s `pool_group`/`pool_broke_first`
  rather than re-derived. Longest Pot Streak was the one non-trivial piece —
  a gaps-and-islands window-function query (a running `SUM() OVER (ORDER BY
  sequence_num)` that increments on every turn-ending event, per
  `poolEngine.ts`'s `endTurn()`, giving every event a stable per-turn group
  id to `MAX()` own-ball pots within). `ProfilePage.tsx` gained a Pool
  "Advanced Analytics" tile block (mirroring Chip Off's) and a `'pool'` entry
  in the Compare Modal's hardcoded sport list, closing the profile-parity gap
  where Pool previously got only the generic Played/Won/Lost tile and no
  comparison rows at all. Verified via a synthetic `execute_sql` transaction
  covering a multi-turn streak, an interrupted-then-resumed turn, and a
  wire-to-wire win, always rolled back — zero retroactive impact. See
  `STATS_AUDIT_LOG.md`'s Pool section for the full calculation write-up.
- **Kelly Pool variant.** Deferred from the 2026-08-01 pool rebuild —
  needs secret per-player ball assignment and call-shot elimination, a
  different enough mechanic from `16_ball`/`8_ball` that it warrants its own
  design pass rather than forcing it into the shared `poolEngine.ts` reducer.
- _Nothing else planned yet — add here as ideas come up._
