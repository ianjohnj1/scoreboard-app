# TODO

Tracks known gaps, unresolved tech debt, and planned features for this app.
`CLAUDE.md` documents what's already true of the code; this file is where
forward-looking intent lives instead — update it directly as scope changes,
rather than letting it accumulate in CLAUDE.md.

## Known gaps

- **Match deletion is admin-only, even for the creator.** Currently by
  design (see `deleteMatch()` in `src/lib/matches.ts`), but worth revisiting
  — a creator may reasonably expect to delete their own not-yet-played match.
- **No automated test suite.** No test runner is installed; verification is
  `npm run typecheck` + `npm run lint` + manual browser QA. Fine for now, but
  means regressions in event-sourced score logic (the sport rooms rehydrating
  from `match_events`) rely entirely on manual testing.
- **Sport/variant dispatch tables can drift silently.** Adding a sport or
  variant touches four places (`getSportRoom()` in `MatchRoomPage.tsx`; the
  `sportRooms` map *and* golf-variant branch in `SpectatorPage.tsx`;
  `getSportIcon()`/`getSportLabel()` in `lib/matches.ts`; `NewMatchPage.tsx`).
  Missing one doesn't error — spectator view just silently falls back to
  `CustomRoom`. No lint rule or test currently catches this.

## Tech debt

- **Decide the fate of `player_career_stats`.** As of 2026-07-30
  (`ddcf0cc`) the client no longer writes to it and nothing reads it — the
  leaderboard is fully live-computed by `getGlobalLeaderboardData()` in
  `src/lib/stats.ts`. The table has no INSERT/UPDATE RLS policy by design.
  Either formally revive it as a real server-computed cache (materialized
  view / cron job) or drop it via a migration — leaving it inert invites a
  future "why does this table have no write policy?" audit finding.
- **`STATS_AUDIT_LOG.md` is stale.** It still documents darts (`extra_stats`)
  and Chip Off metrics as being persisted to `player_career_stats`, which
  hasn't been true since the client-write revocation above. Needs a rewrite
  to describe the actual live/`stats.ts`-computed pipeline before anyone
  trusts it as the source of truth for a metric's storage path.
- **Audit other tables for the same DELETE-has-admin-override,
  UPDATE-doesn't gap fixed on `match_rooms` (2026-07-30, see CLAUDE.md).**
  Only `match_rooms` was checked and fixed; `match_players`, `match_teams`,
  `cricket_innings`, `golf_holes`, etc. were never checked for whether their
  write policies actually grant `is_admin_session()` where the client-side
  `ctx.isAdmin` checks assume they do.
- **Write helpers don't detect an RLS-blocked no-op.** `updateMatchStatus()`
  and friends in `lib/matches.ts` only check `error`, but a PostgREST UPDATE
  filtered to 0 rows by RLS returns `204` with no error — indistinguishable
  from a real success. This is exactly how the `match_rooms` admin-override
  gap above went unnoticed: an admin's End & Lock click looked successful
  while doing nothing. Worth having these helpers check affected row count
  (or `.select()` + verify a row came back) and throw if nothing changed,
  rather than relying on every RLS policy being audited perfectly.

## Bug fixes

_None open right now — add here when a bug is confirmed but not yet fixed._

## Future features

_None planned yet — add here as ideas come up._
