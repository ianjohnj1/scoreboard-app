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

What breaks first, in order (item 1's compute half is fixed as of
2026-07-30 — see P0):

1. `getGlobalLeaderboardData()` payload and client compute (P0-1, P0-2).
2. Free-plan egress — ~6.9 KB per cumulative match per leaderboard load, so
   5 GB/mo allows ~2,460 loads at 300 cumulative matches, ~740 at 1,000.
3. Postgres connection pool — once leaderboard queries hold a connection for
   seconds, one slow page becomes app-wide errors.

Realtime concurrency (200) and DB size (~4,300 matches' worth of events) are
not binding before those. The free tier's 7-day inactivity auto-pause is a
separate availability limit that no code change fixes.

P0-1 and P0-2 together are what make 100 users viable **without** immediately
moving to Pro — server-side aggregation cuts the per-load payload from
megabytes to a few KB. Pro ($25/mo, 250 GB egress, no auto-pause) is the
right call once the user base is real, but it buys headroom rather than
substituting for these fixes.

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
- **Every sport-tab switch re-runs the whole pull.** `loadLeaderboard` in
  `src/pages/LeaderboardPage.tsx` depends on `sport`, so browsing the nine
  tabs is nine full fetches. The `leaderboard-live` channel also triggers a
  complete recompute on *any* match completion anywhere. Fix: fetch once,
  filter client-side per tab; debounce the realtime-driven refresh.
- **`recordEvent()` has a sequence-number race.** `src/lib/matches.ts` does a
  `count` then inserts `count + 1` against `UNIQUE (match_id, sequence_num)`.
  Two people scoring the same match simultaneously both read N, both write
  N+1, one gets a unique violation. It fails loudly rather than corrupting
  data, but it caps concurrent scorers per match at one — which bites far
  more often at 100 users than at 20. Fix: assign `sequence_num` server-side
  (a `BEFORE INSERT` trigger using `max()+1` scoped to the match, or move the
  whole insert into an RPC). Also removes a round trip per scored event.

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
- **No automated test suite.** No test runner is installed; verification is
  `npm run typecheck` + `npm run lint` + manual browser QA. This gets more
  expensive with every item above: the P0 leaderboard rewrite and the
  `sequence_num` change both touch event-sourced score logic with no
  regression net under them. Worth installing a runner before starting P0-2.
- **Sport/variant dispatch tables can drift silently.** Adding a sport or
  variant touches four places (`getSportRoom()` in `MatchRoomPage.tsx`; the
  `sportRooms` map *and* golf-variant branch in `SpectatorPage.tsx`;
  `getSportIcon()`/`getSportLabel()` in `lib/matches.ts`; `NewMatchPage.tsx`).
  Missing one doesn't error — spectator view just silently falls back to
  `CustomRoom`. No lint rule or test currently catches this.

## Future features

_None planned yet — add here as ideas come up._
