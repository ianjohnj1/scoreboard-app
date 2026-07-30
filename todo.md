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
  points. `pool_frame` routes fine but only increments a counter the
  leaderboard never reads, so pool players also always score 0. The SQL view
  reproduces all of this deliberately rather than changing behaviour mid-
  refactor. Fix is in the rooms, not the view: pass `player_id` on the
  `recordEvent()` call. Note that fixing it will retroactively change season
  points for any existing match of those sports.
- **`DartsRoom` and `CustomRoom` never rehydrate from `match_events`.**
  CLAUDE.md requires every sport without normalised side tables to do this,
  and TableTennis/Pool/Basketball/Cards all do — Darts and Custom only ever
  *write* (`recordEvent` at `DartsRoom.tsx:182`), with state coming from
  `buildInitialState(...)`. Refreshing mid-501 resets the score to the
  start. Neither room has a realtime subscription either, so a second
  device never syncs. Darts is the most stateful sport in the app, so this
  is the worst room to have it in. Confirmed bug, not a scaling issue — but
  at 100 users it stops being rare.
- **Unfiltered global realtime subscriptions.** `fanboy-live` in
  `LeaderboardPage.tsx` listens to *every* comment INSERT app-wide; the
  leaderboard and `ProfilePage` both listen to every completed match. Fan-out
  is linear in concurrent users against a 200-connection / 2M-message-per-month
  free-plan budget. Fix: scope the filters, or poll on an interval for the
  fan-engagement widget.
- **Session-identity RLS helpers are VOLATILE.** `get_current_session_profile_id()`,
  `is_admin_session()`, and `is_match_participant()` are declared VOLATILE, so
  Postgres re-evaluates them **per row** instead of once per query
  (`can_score_match` and `is_match_host` are already correctly STABLE).
  Harmless today only because every SELECT policy is `USING (true)` and writes
  are single-row — the day a read policy gets scoped, this becomes an N-lookup
  scan. Fix: mark them STABLE. Cheap, and worth doing before it's load-bearing.
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
  every scored event; 20 indexes are unused project-wide. Drop what nothing
  reads.
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

_None planned yet — add here as ideas come up._
