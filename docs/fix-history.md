# Fix history

A record of completed fixes, the bugs/incidents that prompted them, and what
each one taught. `CLAUDE.md` documents current state and `todo.md` tracks
what's still open — this file is where their "done" write-ups retire to, so
neither has to carry a growing pile of history to stay readable. Entries are
grouped by theme, newest first within each group. Dates are when the fix
shipped, not when the bug was introduced.

## Security: `rpc_login` and session hardening (2026-07-30)

Five fixes in one day, all touching the same custom PIN-auth surface
(`profiles` + `active_sessions`, see CLAUDE.md's "Auth is custom" section).

### Unlimited profile creation (`20260730215136_rpc_add_guest_player.sql`)

The `profiles` INSERT policy required only `is_admin = false` — no session,
no rate limit — and both guest-add call sites (`MatchRoomPage.tsx`,
`NewMatchPage.tsx`) inserted directly. A single unauthenticated script could
fill the free plan's 500 MB database.

Fix: dropped the INSERT policy outright (it was the only client-side INSERT
path into `profiles` — `rpc_signup` is `SECURITY DEFINER` and never depended
on it), and added `rpc_add_guest_player()`, which requires an active session
and rate-limits to 30 guest creations per rolling hour per *creating*
session via a new `guest_creation_log` table (RLS enabled, zero policies —
same pattern as `login_attempts` below). Both client call sites now go
through `addGuestPlayer()` in `src/lib/auth.ts`.

Verified against live: a real session still creates guests correctly;
simulating 30 prior creations makes the 31st raise; a raw `anon` INSERT now
fails with an RLS violation. Verified end-to-end through the actual UI too
(New Match → Add Player → Add Guest) with no console errors, then the test
profile it created was deleted since that path wasn't a rolled-back
transaction like the SQL-level checks. `typecheck`/`lint`/`test` all clean.

### `active_sessions` never garbage-collected (`20260730214556_garbage_collect_active_sessions.sql`)

316 rows, 313 stale by more than 7 days. Every RLS check reads this table
via `get_current_session_profile_id()`.

Fix: enabled Supabase Cron (`pg_cron`) and scheduled a daily job at 03:00
UTC deleting rows with `last_seen < now() - interval '7 days'`;
`cron.schedule()` upserts by job name, so the migration is safe to re-run.
Also ran the same delete once immediately to clear the backlog rather than
waiting for the first scheduled run.

**Lesson: the "307 rows on one profile" red flag wasn't what it looked
like.** Re-measuring before the fix found every profile except one already
had exactly one session row — `rpc_login`'s find-or-create reuse logic was
working correctly the whole time. The 307 were all on a single profile,
almost certainly dev/test churn from repeated login/logout during active
development (June–July build period), not 16 real users each accumulating
hundreds of rows. Worth actually looking at anomalous numbers before
designing a fix around them.

Verified against live: row count went 316 → 3, the 3 survivors are exactly
the sessions genuinely active in the last day, `rpc_login` still works
normally afterward.

### No rate limiting on `rpc_login` (`20260730212541_rate_limit_rpc_login.sql`, `20260730213012_fix_rpc_login_ambiguous_username_column.sql`)

4-digit PIN, static salt, single SHA-256 round — 10,000 candidates is
seconds of parallel requests, and with the account-takeover hole below
closed, direct brute force was the remaining way into an account that
isn't yours.

Fix: a new `login_attempts` table (RLS enabled, zero policies) logs each
failed attempt; `rpc_login` checks the count for that username in the last
15 minutes *before* touching any credential material, and rejects with the
same empty result as a wrong PIN at 10 or more — so a caller can't tell
"wrong" from "locked out," and even the correct PIN is rejected while
locked out. At 10 attempts/15min, exhausting the keyspace takes 10+ days.
Scoped to per-username counting, not per-IP (no reliable caller IP inside a
`SECURITY DEFINER` function here) — this closes brute-forcing one victim's
PIN, not a low-and-slow scan across many usernames, which needs usernames
to stop being publicly enumerable first (`todo.md`'s `USING (true)` P2
item). Stale rows are pruned inline per-username on that username's own
next call, no `pg_cron` dependency.

**Lesson: this shipped a genuine ~1-minute outage on first deploy.**
`rpc_login`'s `RETURNS TABLE` already declares an output column named
`username`, and the first version of this migration referenced `username`
unqualified in the new rate-limit queries — ambiguous against that output
column, so Postgres rejected *every* call to `rpc_login` with "column
reference ambiguous," not just the rate-limited path. Caught immediately by
testing `rpc_login('claudetester', '1234')` right after deploying, fixed
forward within about a minute by qualifying every reference as
`login_attempts.username`. Both migration files were kept as separate,
timestamp-accurate entries — the first left exactly as it was actually live
(broken), not edited in place — rather than squashed into one "clean"
migration, per the migration-drift lesson below: the files should match
`supabase migration list` exactly, not a tidied-up retelling.

Verified against live: the counter caps at exactly 10 and stops logging
further attempts; pruning correctly resets the window after 15 minutes; a
real login and the scoped recovery fallback below both still work and are
unaffected by an unrelated username's lockout.

### `rpc_login` let anyone claim an unclaimed account with any PIN (`20260730204939_fix_rpc_login_account_takeover.sql`, `20260730211610_scope_rpc_login_recovery_fallback.sql`)

If a profile had `pin_hash IS NULL AND is_guest = false`, `rpc_login`
accepted *any* PIN and set it as that account's permanent PIN. 7 such
profiles were live. Because the `profiles` SELECT policy is `USING (true)`,
usernames were publicly enumerable with just the anon key, so any of the 7
could be silently taken over by a stranger — this needed zero user growth
to matter, unlike the P0 scaling items.

First fix removed the null-`pin_hash` fallback branch entirely. Verified
against live in a rolled-back transaction: guessing a PIN for one of the 7
returned no rows and left `pin_hash` still null; real login was unaffected.

**Lesson: the 7 stranded accounts turned out not to be unclaimed
placeholders.** They're real accounts real people had already set up and
used. `20260723000004_reset_pin_hash.sql` (see below) had wiped every
profile's `pin_hash` to unify two incompatible hashing schemes, expecting
everyone to log back in once and silently re-set it — the fallback removed
above *was* that self-service recovery path, not a "claim your placeholder"
feature. Most users had already completed that re-login; these 7 just
hadn't opened the app again since. Removing the fallback outright would
have permanently locked out 7 real friends, not closed a hole in unused
accounts.

Second fix restored the recovery path, scoped to a fixed, closed list of
exactly those 7 usernames (`mrchanman`, `primeserpentz`,
`dnagle9801@gmail.com`, `bandy1703@hotmail.com`, `worko06`, `chole`,
`andrewjones98`) instead of any row with `pin_hash IS NULL`, so those
specific people can still recover their account but no other account
(present or future) ever can. `profiles.username` has a DB-level `UNIQUE`
constraint, so nothing can be created to shadow one of the listed
usernames. **Do not add usernames to this list for new or placeholder
accounts** — `rpc_signup` always sets a real `pin_hash` immediately, so no
legitimately-created account should ever need this path; it should only
grow if another genuine pre-reset straggler turns up.

Verified against live: `worko06` still recovers (any PIN accepted,
`pin_hash` gets set); a synthetic non-listed profile with `pin_hash IS
NULL` does not.

## Testing infrastructure (2026-07-30)

No test runner existed before this date; `npm run typecheck` + `npm run
lint` + manual browser QA was the whole verification story. See CLAUDE.md's
Testing section for what exists today and how to run it — this entry is
the "why now" and "what it replaced."

- **Vitest** (`vitest.config.ts`) — 47 tests over pure TypeScript logic with
  no Supabase/DOM dependency: the three darts sub-game reducers (previously
  verified only by playing a full game manually), the dashboard status
  partition helpers, sport/variant label lookups, and the season-points/
  grouping helpers from the P0 leaderboard rewrite (previously verified
  only by a one-off differential script that was never checked in).
- **`match_event_points.test.sql`** (pgTAP, 39 assertions) — covers all 14
  branches of the Postgres function deciding what a `match_event` is worth
  toward the leaderboard, extracted specifically for this kind of testing
  during the P0 leaderboard rewrite. 11 of 14 branches had zero live-data
  coverage before this (the live database only ever held 3 event types).
  Verified by running it against the live project via `execute_sql`, one
  transaction that always rolls back — pure `SELECT`s against synthetic
  jsonb, nothing written anywhere.
- **`rls_smoke.test.sql`** (pgTAP, 17 assertions) — covers the two RLS bug
  classes this repo has actually shipped (see the admin-override and
  migration-drift entries below): an admin-override branch present on one
  policy/command but missing from a sibling, and plain ownership isolation.
  Seeds four synthetic profiles/sessions/a match via `session_replication_role
  = replica` (so the profiles guard trigger doesn't block seeding a
  synthetic admin), impersonates each identity by setting the
  `request.headers` GUC the same way PostgREST does per-request, `set local
  role anon` to actually drop the `postgres` connection's `BYPASSRLS`.

  **Lesson: the first run caught a bug in the test's own expectation, not
  the app.** It assumed the RLS `with_check` would be what blocks a
  self-assigned-admin profile insert, but the `guard_profiles_protected_columns`
  trigger fires first and raises its own exception before RLS is ever
  evaluated — both are real defense in depth, the test just had the wrong
  one as "what actually throws first." Fixed, 17/17 pass now.

  Verified against live the same way as the other pgTAP file: rolled-back
  transaction, confirmed zero rows and no `pgtap` extension left behind
  afterward.

Neither pgTAP file is wired to run automatically anywhere yet — no local
Supabase stack, no CI. That's tracked as still-open in `todo.md`.

## Performance & scaling — P0 (2026-07-30)

Baseline from a 2026-07-30 architecture audit against the live project
(`henoedqzusmnxtxdsyuc`, free plan, Sydney): 163 events/match average (453
max), ~5 players/match, a `match_events` row costs 444 B JSON / 42 B
gzipped over the wire / ~700 B on disk with indexes, a full event pull (959
rows) took 142 ms. Free-plan limits: 5 GB egress/mo, 500 MB DB, 200 peak
realtime conns, 60 Postgres conns. The ceiling was cumulative match
history, not concurrent users — nothing pruned or cached, so it would
arrive with time even at flat user count (~400 matches/year at 20 users
reaches the degradation zone in about a year with zero growth).

What broke first, in order, and how each was fixed:

1. **`getGlobalLeaderboardData()` was O(matches × events).**
   `groupByMatchId()` in `src/lib/stats.ts` now buckets players, events,
   and cricket stats by `match_id` in one pass before the per-match loop,
   replacing three `.filter()`-per-match scans. Verified partition-
   identical to the old behaviour against live data. Measured on synthetic
   data at the real 163-events/match ratio: 300 matches 114ms → 0.8ms,
   1,000 matches 1,370ms → 2.0ms, 2,000 matches 6,320ms → 8.2ms.

2. **The leaderboard pulled the entire database on every load.** The
   `leaderboard_match_player_scores` Postgres view (`20260730143009`,
   refactored for testability by `20260730143429`, which extracted the
   per-event scoring rules into the standalone `match_event_points()`
   function used by the pgTAP tests above) reduces `match_events`
   server-side to one row per (match, roster player);
   `getGlobalLeaderboardData()` no longer fetches `match_events`,
   `match_players`, or `cricket_player_stats` at all. Measured on live
   data: 34,376 → 2,248 bytes gzipped per load, 16,452 → 388 bytes per
   match (42x) on the part that grows with history — roughly 25x more
   leaderboard loads per cumulative match within the free plan's 5 GB.

   Verified two ways, since live data covered only 3 of 14 event types: a
   differential against a faithful reimplementation of the old TypeScript
   reduction over live rows (105 field comparisons, 0 mismatches), and the
   39 synthetic per-branch `match_event_points()` cases covering all
   fourteen event types including the eleven with no live data.

   Placement, season points, milestones, lifetime counters and best scores
   were deliberately **not** ported to SQL — they stay in `stats.ts` so
   `SEASON_POINT_RULES` remains the single source of truth for both the
   math and the leaderboard's explainer modal, avoiding a constant-vs-
   hardcoded-SQL drift risk. Aggregating those in SQL too would cut payload
   another 5-10x — worth revisiting only if egress becomes binding again,
   and only behind a test suite (which now exists).

3. **Every sport-tab switch re-ran the whole pull.** `loadLeaderboard` in
   `LeaderboardPage.tsx` now fetches `rawStats` once with no `sport`
   dependency; filtering, cross-sport aggregation, and sorting moved into a
   `useMemo`. Verified by instrumenting
   `performance.getEntriesByType('resource')` and clicking through five
   tabs: zero Supabase calls after initial mount. The realtime subscription
   is also now debounced 1500ms, so a burst of match completions collapses
   into one reload instead of one per event.

4. **`recordEvent()` had a sequence-number race**, capping concurrent
   scorers per match at one. `sequence_num` is now assigned by a `BEFORE
   INSERT` trigger (`set_match_event_sequence_num()`,
   `20260730171039_server_side_match_event_sequence_num.sql`) taking a
   transaction-scoped advisory lock keyed by `match_id`
   (`pg_advisory_xact_lock(hashtextextended(...))`) instead of a
   client-side `SELECT count(*)` then `INSERT count+1` — the same race
   existed twice, independently, in `recordEvent()` and in
   `CricketRoom.tsx`'s bulk dot-ball insert. Verified three ways: a scratch
   TEMP table confirmed row visibility advances correctly within one
   multi-row INSERT; a real multi-row insert against a live match continued
   correctly from the existing max and silently overwrote a stale
   client-supplied value; three rapid taps through the actual app UI
   produced clean sequential values with no console errors.

None of this replaced upgrading to Pro ($25/mo, 250 GB egress, no
auto-pause) once the user base is real — it bought headroom so that
upgrade is a choice made from comfortable footing, not a fix for something
already breaking.

## Pre-session RLS and migration incidents (documented in `CLAUDE.md`, dated)

These predate the 2026-07-30 work above but are the reason several of this
repo's current rules exist. Kept here in full; `CLAUDE.md` keeps only the
durable rule each one taught.

### Bolt.new silently reverted two files (2026-07-26)

This app was iterated on through several AI coding tools (`.trae/`,
`.bolt/`, `.cursor` directories) before consolidating on Claude Code; their
durable content was merged into `CLAUDE.md` and the directories removed on
2026-07-26. That history was a live risk, not just clutter: on that same
day, `src/contexts/AuthContext.tsx` and
`src/components/sports/TableTennisRoom.tsx` were found silently reverted to
older versions on disk at the start of a session — Bolt.new was still
connected to the repo and had overwritten both files locally. The reverted
`AuthContext.tsx` reintroduced the session-forgery hole the current
version's own comments warn about (recovering a session from a cached
profile id instead of `rpc_resume_session`), plus a `select('*')` on
`profiles` that fails outright now that `pin_hash` is revoked. `npm run
typecheck` caught it immediately via an unrelated-looking argument-count
error in `LoginPage.tsx`.

Bolt's Supabase connection was disconnected and Bolt, Lovable, and Cursor
all had their GitHub access to this repo revoked the same day, closing this
specific vector. The durable lesson — unexplained modifications at session
start, especially to auth/security-sensitive files, shouldn't be assumed to
be the user's in-progress work — lives on in `CLAUDE.md`.

### Migration history drifted from live twice (2026-07-23, 2026-07-26)

The local `supabase/migrations/` folder and the remote `schema_migrations`
ledger went out of sync twice: 2026-07-23 (colliding date-only prefixes
plus ~30 files applied by hand-pasting SQL into the dashboard, with no
local record at all) and 2026-07-26 (more of the same, plus the Supabase
MCP's `apply_migration` tool — see below). Both were fixed the same way:
verify each file's real effect against live `pg_policies`/`pg_indexes`
first, rename it to a unique 14-digit timestamp reflecting when it actually
happened (from git blame/commit content, never guessed), then `supabase
migration repair --status applied <version>` — bookkeeping only, it never
executes SQL. That last part mattered: several of the files reconciled on
2026-07-26 (`fix_active_sessions_rls.sql`, `fix_rls_for_custom_auth.sql`,
now dated `20260626`/`20260702`) create the exact `USING (true)` policies
the later RLS lockdown removed — actually re-running them via `db
push`/`db reset` would have reopened that hole, which is exactly why
`repair` and never `push` was the right tool.

`apply_migration` is a live source of this drift, not just something that
fixes it: it auto-generates its own version at apply time regardless of
what the local file is named, so a mismatch appears immediately after
every use. This session (2026-07-30) hit this repeatedly while applying
the `rpc_login`/session/guest-creation fixes above — every one of those six
migrations needed `list_migrations` checked and the local file renamed
immediately after applying, exactly per this lesson, and none of them
drifted as a result.

### Admin-override RLS gaps found twice in one audit (2026-07-30)

A client-side `ctx.isAdmin` override is only real if the matching RLS
policy grants it too — they can silently diverge. Until
`20260730024459_match_rooms_update_admin_override.sql`, `match_rooms`'s
DELETE policy included `OR is_admin_session()` but its UPDATE policy
(`is_match_participant(id)` only) didn't, even though every sport room's
client code treats admin as a blanket override
(`match.status === 'active' || ctx.isAdmin`) for actions like the header
menu's Pause/End & Lock. An admin ending a match they didn't create or join
saw success and a closed dialog, but the write silently affected 0 rows —
PostgREST returns `204` for an RLS-filtered UPDATE exactly like a real
success, so nothing in the client ever surfaced an error.

Following up on the same audit
(`20260730032155_add_admin_override_to_scoring_and_roster_rls.sql`) found
the actual scoring path had it worse: `can_score_match()` — the single
function gating INSERT/UPDATE on `match_events`, `cricket_innings`,
`cricket_player_stats`, `golf_holes`, and `golf_scores` — had no admin
branch at all (only `is_match_host()` or a `match_players` row with role
`player`/`scorer`), so an admin scoring a match they didn't create or join
got a hard RLS-violation error on every tap, not a silent no-op. Fixed by
adding `OR is_admin_session()` inside `can_score_match()` itself, covering
all five tables in one place. The same class of gap existed on
`match_players`/`match_teams` INSERT (host-only, breaking the Edit Roster
"Add Player" button for a non-host admin) and UPDATE (no current call
site, fixed anyway for consistency).

The durable rule — verify a sibling command's policy actually has the same
admin branch, don't assume it matches just because they're defined next to
each other — lives on in `CLAUDE.md`, and is exactly what
`rls_smoke.test.sql`'s admin-override assertions (Testing section above)
now guard against regressing.

### `player_career_stats` retired (2026-07-29 → 2026-07-30)

Used to be a client-written cache table for per-player analytics. The
client stopped writing to it on 2026-07-29
(`20260729224346_revoke_client_writes_player_career_stats.sql`, revoking
INSERT/UPDATE), and since nothing read it either, it was dropped outright
the next day
(`20260730030956_drop_dead_player_career_stats_table.sql`). Derived
per-player analytics now come from the Postgres views
`player_career_analytics` and `fan_engagement_stats`, independently
recomputed from raw tables. If this name resurfaces in an old migration
file, a stale doc, or a linter suggestion, it's referring to a table
that's gone — a fresh table/migration would be needed to revive the
concept, not a reference to this name.
