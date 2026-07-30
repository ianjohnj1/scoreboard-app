# TODO

Tracks known gaps, unresolved tech debt, and planned features for this app.
`CLAUDE.md` documents what's already true of the code; this file is where
forward-looking intent lives instead — update it directly as scope changes,
rather than letting it accumulate in CLAUDE.md.

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

**All four P0 items are done as of 2026-07-30** — see the P0 section below
for what shipped and how each was verified. What broke first, in order, and
how each was addressed:

1. `getGlobalLeaderboardData()` client compute — was O(matches × events);
   fixed by grouping child rows into a `Map` before the per-match loop.
2. `getGlobalLeaderboardData()` payload/egress — was downloading every
   `match_event` ever recorded on every load; fixed by pushing the per-event
   reduction into a Postgres view, cutting the per-match cost 42x.
3. Sport-tab switching and realtime-triggered reloads re-running the whole
   pull — fixed by fetching once and deriving per-tab views client-side, plus
   debouncing the realtime refresh.
4. `recordEvent()`'s sequence-number race capping concurrent scorers per
   match at one — fixed by moving `sequence_num` assignment into a
   `BEFORE INSERT` trigger serialized per-match with an advisory lock.

Free-plan egress now allows roughly 25x more leaderboard loads per cumulative
match than before item 2 (measured: 34,376 → 2,248 bytes gzipped per load on
the live dataset). Postgres connection pool pressure eases with it, since
leaderboard queries no longer hold a connection for seconds. Realtime
concurrency (200 conns) and DB size (~4,300 matches' worth of events) were
never binding before those. The free tier's 7-day inactivity auto-pause is a
separate availability limit that no code change fixes.

None of this replaces Pro ($25/mo, 250 GB egress, no auto-pause) once the
user base is real — it buys headroom so that upgrade is a choice made from
comfortable footing, not a fix for something already breaking. **What's left
before 100 users is the P1 list below** — in particular the live
`rpc_login` account-takeover hole, which needs zero user growth to matter.

## P0 — blocks 100 users

- ~~**`getGlobalLeaderboardData()` is quadratic in match count.**~~ **Done
  2026-07-30.** `groupByMatchId()` in `src/lib/stats.ts` buckets players,
  events, and cricket stats by `match_id` in one pass before the per-match
  loop, replacing three `.filter()`-per-match scans. Verified partition-
  identical to the old behaviour against live data (same elements, same
  order, same identity), so leaderboard output is unchanged. Measured on
  synthetic data at the real 163-events/match ratio: 300 matches 114ms → 0.8ms,
  1,000 matches 1,370ms → 2.0ms, 2,000 matches 6,320ms → 8.2ms (desktop; a
  mid-range phone runs roughly 4–8x slower). The compute wall is now well past
  10,000 matches — **payload/egress (next item) is the binding constraint from
  here.**
- ~~**The leaderboard pulls the entire database on every load.**~~ **Done
  2026-07-30**, scoped to pushing the per-event reduction down (see the
  scoping note below). The `leaderboard_match_player_scores` view
  (`20260730143009`, refactored for testability by `20260730143429`) reduces
  `match_events` server-side to one row per (match, roster player);
  `getGlobalLeaderboardData()` no longer fetches `match_events`,
  `match_players`, or `cricket_player_stats` at all, and `match_rooms` is
  down to five columns from `select('*')`. Measured on live data: **34,376 →
  2,248 bytes gzipped per load, and 16,452 → 388 bytes per match (42x)** on
  the part that grows with history. At 1,000 cumulative matches that turns
  the free plan's 5 GB from ~740 leaderboard loads into ~13,000.

  Verified two ways, because live data covers only 3 of 14 event types: a
  differential against a faithful reimplementation of the old TypeScript
  reduction over live rows (105 field comparisons, 0 mismatches, no missing
  or extra rows), and 39 synthetic per-branch cases through
  `match_event_points()` covering **all fourteen** event types including the
  eleven with no data (0 mismatches). Rendered leaderboard values are
  unchanged from a pre-change snapshot.

  Placement, season points, milestones, lifetime counters and best scores
  were deliberately **not** ported and still live in `stats.ts`. That keeps
  `SEASON_POINT_RULES` the single source of truth for the maths and the
  explainer modal both, so the constant-vs-hardcoded-SQL drift risk noted
  during the audit never materialised. Aggregating those in SQL too would
  cut payload perhaps another 5-10x (one row per player per sport rather
  than per match) — worth revisiting only if egress becomes binding again,
  and only behind a test suite.
- ~~**Every sport-tab switch re-runs the whole pull.**~~ **Done 2026-07-30.**
  `loadLeaderboard` in `src/pages/LeaderboardPage.tsx` now fetches
  `rawStats` once, with no `sport` dependency; filtering, the
  `sport === 'all'` cross-sport aggregation, and sorting all moved into a
  `useMemo` keyed on `[rawStats, sport]`, so switching tabs is a synchronous
  client-side recompute with zero network calls. Verified by instrumenting
  `performance.getEntriesByType('resource')` in the browser preview and
  clicking through five tabs (Global MVP → Cricket → Golf → Darts →
  Basketball → back to Global MVP): the only Supabase requests observed
  were the pre-existing 30s session heartbeat and lazy avatar image loads,
  zero calls to `match_rooms`/`leaderboard_match_player_scores`/`profiles`
  after the initial mount. Rendered values unchanged throughout. The
  `leaderboard-live` realtime subscription is also now debounced 1500ms
  (`refreshTimeoutRef`, mirroring the pattern already used in
  `GolfRoom`/`ChipOffRoom`/`CricketRoom` for their own realtime channels),
  so a burst of match completions collapses into one reload instead of one
  per event. This also let the `refreshKey` state/effect indirection be
  removed in favour of calling `loadLeaderboard()` directly.
- ~~**`recordEvent()` has a sequence-number race.**~~ **Done 2026-07-30.**
  `sequence_num` is now assigned by a `BEFORE INSERT` trigger
  (`set_match_event_sequence_num()`,
  `20260730171039_server_side_match_event_sequence_num.sql`) instead of a
  client-side `SELECT count(*)` then `INSERT count+1` - the same race
  existed twice, independently, in `recordEvent()` (`src/lib/matches.ts`)
  and in `CricketRoom.tsx`'s `completeOverEarly()` bulk dot-ball insert.
  The trigger takes a transaction-scoped advisory lock keyed by `match_id`
  (`pg_advisory_xact_lock(hashtextextended(...))`) so concurrent inserts
  serialize per-match without a global bottleneck, then computes
  `max(sequence_num)+1` under that lock. Verified three ways: (1) a scratch
  TEMP table confirmed Postgres advances row visibility between rows of the
  *same* multi-row INSERT, so `completeOverEarly()`'s bulk insert gets
  correctly incrementing values in one statement (4 rows in one group came
  back 1,2,3,4, an unrelated group's row came back 1); (2) a real multi-row
  insert against a live match continued correctly from the existing max
  (311 → 312, 313) and a client-supplied stale value (9999) was silently
  overwritten with the correct next value (314), both cleaned up
  immediately after; (3) end-to-end through the actual app UI - three rapid
  scoring taps on a live practice match produced clean sequential
  `sequence_num` values 1, 2, 3 with correct scores and no console errors,
  confirmed against the database, then the scratch match was cleaned up.
  Both call sites no longer compute or send `sequence_num` at all.

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

- **`rpc_login` lets anyone claim an unclaimed account with any PIN.** If a
  profile has `pin_hash IS NULL AND is_guest = false`, the function accepts
  any PIN and *sets* it as that account's PIN. There are **7 such profiles
  live right now**. Because the `profiles` SELECT policy is `USING (true)`,
  usernames are publicly listable with the anon key, so the targets are
  enumerable. Fix: drop the null-`pin_hash` fallback branch and give those 7
  profiles a real claim flow (or mark them guests).
- **No rate limiting on `rpc_login`.** 4-digit PIN, static salt
  (`scorekeeper:${pin}:salt2024`), single SHA-256 round — 10,000 candidates
  is seconds of parallel requests. Fix: attempt counter keyed on
  username/IP with backoff, inside the RPC.
- **Anyone can create unlimited profiles.** The `profiles` INSERT policy is
  only `is_admin = false`, and `handleAddGuest` in `MatchRoomPage.tsx`
  inserts client-side. One script fills the 500 MB database. Fix: route guest
  creation through a `SECURITY DEFINER` RPC that requires a valid session and
  rate-limits per session.
- **DartsRoom and CustomRoom never rehydrate from `match_events`.** CLAUDE.md
  requires every sport without normalised side tables to do this, and
  TableTennis/Pool/Basketball/Cards all do — Darts and Custom only ever
  *write* (`recordEvent` at `DartsRoom.tsx:182`), with state coming from
  `buildInitialState(...)`. Refreshing mid-501 resets the score to the start.
  Neither room has a realtime subscription either, so a second device never
  syncs. Darts is the most stateful sport in the app, so this is the worst
  room to have it in. Confirmed bug, not a scaling issue — but at 100 users
  it stops being rare.
- **`active_sessions` is never garbage-collected.** 316 rows for 16 profiles,
  **307 of them on a single profile**, 313 stale by more than a day. Every
  RLS check reads this table. Fix: a `pg_cron` job deleting rows with
  `last_seen < now() - interval '7 days'`.
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

## P2 — headroom beyond 100 users

- **Every SELECT policy is `USING (true)`.** The anon key ships in the client
  bundle, so anyone can read every profile, match, event, and comment. A
  deliberate call for a mates' scoreboard; a blocker for any public or
  multi-group audience. Decide which way this app is going before building on
  top of it — scoping reads later means revisiting every list page, and it
  interacts with the VOLATILE-helper item above.
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
- ~~**No automated test suite.**~~ **Partially done 2026-07-30.** Vitest is
  installed (`npm test`), covering pure logic with no Supabase/DOM
  dependency: the three darts sub-game reducers
  (`src/lib/darts/*Engine.test.ts`), the dashboard status partition helpers
  and sport/variant label lookups (`src/lib/matches.test.ts`), and the
  season-points/grouping helpers from the P0 leaderboard rewrite
  (`src/lib/stats.test.ts`) — 47 tests total. See the Testing section in
  `CLAUDE.md` for what's covered and why.

  ~~`match_event_points()` has no repeatable test harness.~~ **Done
  2026-07-30**: `supabase/tests/database/match_event_points.test.sql` is a
  checked-in pgTAP file (39 assertions, all 14 branches plus
  `darts_event_score()`'s single-throw/darts-array paths and the
  `point`/`score` falsy-zero quirk). Verified by running it against the live
  project via the Supabase MCP's `execute_sql` (transaction always rolled
  back — pure `SELECT`s, so nothing was ever at risk); all 39 pass.

  ~~No RLS/policy regression tests.~~ **Done 2026-07-30**:
  `supabase/tests/database/rls_smoke.test.sql` (17 assertions) covers the
  admin-override and ownership-isolation bug classes described above. Also
  verified against live the same way — seeds synthetic profiles/sessions/a
  match, impersonates each identity via the `request.headers` GUC trick,
  runs the assertions, then rolls back (confirmed zero rows and no
  `pgtap` extension left behind afterward). All 17 pass now; the first run
  caught a bug in the *test's* expectation (see CLAUDE.md's Testing
  section), not in the app.

  Neither file is wired to run automatically anywhere yet — no local
  Supabase stack to `supabase test db` against (see Environment in
  `CLAUDE.md`), and no CI. Next step for both is deciding where they run
  on a recurring basis (local Docker stack vs. a Supabase branch vs. CI),
  not writing more assertions.

  Still gaps, in rough priority order:
  - **`getGlobalLeaderboardData()`'s reduction loop** (placement, milestone
    SP, chip-off team ordering) is still untested — it's tightly coupled to
    chained Supabase calls, so testing it means either extracting the
    reduction into a pure function or building a fake PostgREST client.
  - **`rls_smoke.test.sql` covers two bug classes on a handful of tables,
    not the full RLS surface.** Most policies (match_teams, comments,
    cricket/golf side tables, …) still have no test at all.
  - **No component/e2e tests and no CI.** The manual browser-preview QA
    loop is still the only verification for anything UI-facing, and
    `npm test` isn't wired into any CI check yet (there is no CI).
- **Sport/variant dispatch tables can drift silently.** Adding a sport or
  variant touches four places (`getSportRoom()` in `MatchRoomPage.tsx`; the
  `sportRooms` map *and* golf-variant branch in `SpectatorPage.tsx`;
  `getSportIcon()`/`getSportLabel()` in `lib/matches.ts`; `NewMatchPage.tsx`).
  Missing one doesn't error — spectator view just silently falls back to
  `CustomRoom`. No lint rule or test currently catches this.

## Future features

_None planned yet — add here as ideas come up._
