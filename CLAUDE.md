# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It documents what's already true of the code — for known gaps, tech debt, and planned features, see [todo.md](todo.md); for completed fixes and the incidents behind them, see [docs/fix-history.md](docs/fix-history.md).

## Commands

```bash
npm run dev          # Vite dev server on :5173 (use preview_start {name: "dev"} — .claude/launch.json)
npm run dev:host     # same, exposed on the LAN for phone testing
npm run typecheck    # tsc --noEmit -p tsconfig.app.json
npm run lint         # eslint .
npm run build        # vite build -> dist/
npm test             # vitest run -- unit tests, see Testing below
npm run test:watch   # vitest (watch mode)
```

- **`npm run build` does not typecheck** — it's `vite build` alone. `npm run typecheck` is the real gate; run it after any non-trivial edit.
- **Lint is clean** (0 errors, 0 warnings, as of 2026-07-30 — it used to sit at ~66 errors/~9 warnings, mostly `@typescript-eslint/no-explicit-any`). Treat any new error or warning as a real regression, not baseline noise, and fix it rather than reaching for `any`. A handful of `react-hooks/exhaustive-deps` and `react-refresh/only-export-components` warnings are permanently silenced with inline `eslint-disable-next-line` comments where the "fix" would be worse than the warning (see the Realtime note below, and `useAuth`/`useTheme` in `AuthContext.tsx`/`ThemeContext.tsx`) — read the comment before touching those lines rather than deleting it to chase a clean count.
- **There is a unit test suite (Vitest, added 2026-07-30) but it's narrow** — see Testing below. It covers pure logic only; there's still no integration/component/e2e coverage and no CI wired up to run it. Verification for anything outside that pure-logic slice is still typecheck + lint + actually driving the app in the browser preview.
- **Deploying is a separate action from committing.** Production (Cloudflare Pages) has no git integration; `git push` never updates the live site. See `.claude/skills/deploy-production/SKILL.md`.
- For browser QA, log in as the existing test account (`claudetester` / PIN `1234`) rather than signing up a new one — every signup becomes a real profile on the shared leaderboard. If the app is already logged in, keep using that session.
- `dev:host` exists for testing on a phone over the LAN; both devices must be on the same Wi-Fi and the host firewall must allow the port.

## Environment

`.env` supplies `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. There is no local Supabase stack and no `supabase/config.toml` — the app and the migrations both point at one shared live project, so schema changes are immediately real for every user.

## Testing

Vitest (`vitest.config.ts`, deliberately separate from `vite.config.ts` — the test runner doesn't need the dev server's port or the React plugin), `environment: 'node'`, no DOM. Tests are colocated as `*.test.ts` next to the file they cover (`src/lib/darts/countdownEngine.test.ts`, not a parallel `__tests__` tree).

Coverage today is deliberately narrow: **pure TypeScript logic with no Supabase or DOM dependency**, chosen because it's the highest-value/lowest-effort slice and because this codebase's actual bug history (the `sequence_num` write race, the twice-found admin-override RLS gap, the `cards_round`/`tt_set` event-routing drop) was never going to be caught by component or e2e tests anyway.

- `src/lib/darts/*Engine.test.ts` — the countdown/around-the-world/killer reducers exercise bust/checkout/double-out rules, target advancement, activation/elimination, and turn rotation including skip-the-eliminated-player rotation. These were previously verified only by playing a full game manually.
- `src/lib/matches.test.ts` — `getMatchDisplayStatus`/`isMatchStale`, the single source of truth for the dashboard's live/paused/done partition (see Dashboard section below); `generateRoomCode`'s format; `getSportIcon`/`getSportLabel`, which are two of the four places sport/variant dispatch has to stay in sync (see the "touches four places" note below — these tests don't cover the other three).
- `src/lib/stats.test.ts` — `calculatePlacementSP` and `groupByMatchId` (the P0 perf rewrite from 2026-07-30, previously verified only by a one-off differential script that wasn't checked in).

**Modules under test import the real `supabase` client at module load** (`matches.ts`, `stats.ts` both `import { supabase } from './supabase'` at the top), and `createClient()` throws immediately if the URL/key are empty. Rather than depend on `.env` being present for unit tests to even load, `matches.test.ts` and `stats.test.ts` both `vi.mock('./supabase', ...)` with a stub before importing — keep doing this for any new test file that imports a module with that same top-level import, rather than relying on `.env` being populated.

**SQL-level tests are separate from the Vitest suite.** `supabase/tests/database/` holds two pgTAP files. Neither runs automatically yet (no local stack, no CI) — both were last run manually against the live project via the Supabase MCP's `execute_sql`, each as a single transaction that always ends in `rollback`, so nothing persisted regardless of pass/fail. To run either yourself: **locally**, `supabase start` (Docker — no local stack exists today, see Environment above) then `supabase test db`; **against a project**, enable the `pgtap` extension there first (`create extension if not exists pgtap with schema extensions;`) and execute the file via `psql` or `execute_sql`. Treat enabling an extension on the shared live project as a live-database change requiring the same care as any other schema change, even for a file that only reads.

- `match_event_points.test.sql` — 41 assertions covering all 15 branches of `match_event_points()`, the Postgres function that decides what a `match_event` is worth toward the leaderboard (see Stats pipeline below), plus `darts_event_score()`'s single-throw/darts-array paths and the `point`/`score` `amount || 1` JS-falsy quirk. Pure `SELECT`s against synthetic jsonb — no tables touched at all.
- `rls_smoke.test.sql` — 17 assertions covering the two bug classes `docs/rls-ground-rules.md` was written about and that this repo has shipped twice (see `docs/fix-history.md`): an admin-override branch present on one policy/command but missing from a sibling, and plain ownership isolation (can a stranger write to a match/profile/session that isn't theirs). Not exhaustive coverage of every policy on every table — one representative case per class, plus a couple of positive/baseline cases so an accidental over-lockdown regression would also be caught. Seeds four synthetic profiles + sessions + a match via `session_replication_role = replica` (so the profiles guard trigger doesn't block seeding a synthetic admin), then impersonates each identity by setting the `request.headers` GUC the same way PostgREST does per-request, `set local role anon` to actually drop the `postgres` connection's `BYPASSRLS`.

**Not covered, on purpose, for now:**
- `getGlobalLeaderboardData()` in `stats.ts` — the full placement/milestone/season-points reduction loop. It's high-value to test but tightly coupled to chained Supabase query calls; testing it properly needs either extracting the reduction into a pure function or a fake PostgREST client, either of which is a real design decision, not a "first tests" addition.
- The rest of the RLS surface beyond `rls_smoke.test.sql`'s two bug classes — most tables/policies still have no test at all.
- Components, pages, and e2e flows — the existing browser-preview QA loop is still the verification path for these.

## Repo hygiene — external tooling history

This app was iterated on through several AI coding tools before consolidating on Claude Code (`.trae/`, `.bolt/`, `.cursor`, removed 2026-07-26) — one of them silently reverted two files mid-session, reintroducing a closed security hole; `npm run typecheck` caught it via an unrelated-looking error, not a manual review. Full incident in `docs/fix-history.md`. The specific vector (Bolt/Lovable/Cursor GitHub access) is closed, but the lesson stands regardless of cause: if `git status` shows unexplained modifications at the start of a session — especially to auth/security-sensitive files — don't assume they're the user's in-progress work. Check `git log`/`git diff` against `HEAD` and confirm with the user before building on top of them.

## Architecture

React 18 + TypeScript + Vite SPA, Tailwind, react-router, Supabase (Postgres + Realtime + Storage). No state library — React Context (`AuthContext`, `ThemeContext`) plus per-page `useState`.

### Auth is custom, not Supabase Auth

Identity is a `profiles` row plus a 4-digit PIN. There are no Supabase JWTs.

- `src/lib/supabase.ts` wraps `fetch` to attach an `x-session-id` header (from `localStorage.sk_session_id`) to **every** request. RLS policies resolve the caller from that header via `get_current_session_profile_id()`. The wrapper must *merge* into existing headers — replacing them strips the apikey and breaks the whole app.
- Login/signup/resume go through `SECURITY DEFINER` RPCs (`rpc_login`, `rpc_signup`, `rpc_resume_session`). Never hash or compare `pin_hash` in client code, and never `INSERT` into `active_sessions` directly — proving identity and minting a session must stay atomic in one RPC.
- `rpc_login` rate-limits failed attempts per username (`login_attempts` table, 10/15min) and has a self-service recovery path for exactly 7 hardcoded legacy usernames stranded by a past PIN-hash reset — **never add a username to that allowlist for a new or placeholder account**; `rpc_signup` always sets a real `pin_hash` immediately, so no legitimately-created account should ever need it. Full story in `docs/fix-history.md`.
- Guest profiles are created via `rpc_add_guest_player()` (`src/lib/auth.ts`'s `addGuestPlayer()`), not a direct client `INSERT` — there is no client-side INSERT policy on `profiles` at all anymore. Requires an active session and rate-limits to 30/hour per creating session (`guest_creation_log` table).
- `profiles.pin_hash` is revoked from anon/authenticated. **Never `select('*')` (or bare `select()`) on `profiles`** — Postgres expands `*` to every column and fails the whole query on the revoked one. Use `SAFE_PROFILE_COLUMNS`, including in `.insert(...).select(...)` / `.update(...).select(...)` chains.
- `localStorage`: `sk_user` (sanitized profile) and `sk_session_id`. A 30s heartbeat updates `active_sessions.last_seen`.

### Matches are event-sourced

`match_rooms` (`room_code`, `sport`, `house_rules` JSON, `custom_config` JSON) → `match_teams` / `match_players` → `match_events` (append-only, `sequence_num`, soft undo via `is_undone`). Write through `recordEvent()` / `undoLastEvent()` in `src/lib/matches.ts`.

Only cricket (`cricket_innings`, `cricket_player_stats`) and golf (`golf_holes`, `golf_scores`) have normalized side tables. **Every other sport's score exists only in `match_events`**, so those rooms must rehydrate their local state from `match_events` on mount or a refresh mid-match shows 0–0.

`useMatchEvents(matchId)` (`src/hooks/useMatchEvents.ts`) is the shared way to read a match's live event log without replaying full history on every refresh — it delta-syncs via a `sequence_num` cursor instead of re-fetching everything on each realtime signal. `ChipOffRoom`, `PvPRoom`, and `PoolRoom` (the `16_ball`/`8_ball` ball-tracking room) use it. `CricketRoom` doesn't: its live state comes from `cricket_innings`/`cricket_player_stats`, and its own `match_events` fetch is a 12-row ticker, not a full replay. `DartsRoom`, `CustomRoom`, `TableTennisRoom`, `PoolFramesRoom` (the legacy no-variant pool fallback), `BasketballRoom`, and `CardsRoom` don't use it yet — see `todo.md`.

`deleteMatch()` clears dependents explicitly in a fixed order — there's no DB cascade, and `comments` is polymorphic (`context_type`/`context_id`) so it has no FK at all.

### Sport rooms

Every scoring UI is `({ ctx }: { ctx: MatchContext })`, with `MatchContext` exported from `src/pages/MatchRoomPage.tsx`. Rooms must honour `ctx.isSpectator` / `ctx.isTvDisplayMode` (disable all input) and refuse writes unless `match.status === 'active'` or `ctx.isAdmin`.

Guard the write-triggering function itself, not just the JSX that renders its button — a 2026-07-30 audit found five rooms (ChipOffRoom, GolfRoom, CricketRoom, DartsRoom, PvPRoom) where a handler like `setScore()`/`persistThrow()`/`handleTieBreakConfirm()` had no internal check at all, trusting the UI alone to hide the affordance; pausing a match independently of that UI state (e.g. via the header menu) let scoring continue. Two of them also used `match.status !== 'completed'` as an "is this match live" proxy, which is wrong because it's also true while `'paused'` — the correct check is always `match.status === 'active' || ctx.isAdmin`.

Variants live in `house_rules.variant`, not in `sport`:

| sport | variant | component |
|---|---|---|
| `golf` | `chip_off` | `ChipOffRoom` |
| `golf` | `putt_vs_putt` | `PvPRoom` |
| `cricket` | `backyard` | `CricketRoom` via `ctx.isBackyard` |
| `darts` | `countdown` / `around_the_world` / `killer` | `DartsRoom` + engines in `src/lib/darts/` |
| `pool` | `16_ball` / `8_ball` | `PoolRoom` + reducer in `src/lib/pool/poolEngine.ts`; no variant set (legacy matches) falls back to `PoolFramesRoom` (frame-tally only) |

**Adding a sport or variant touches four places**: `getSportRoom()` in `MatchRoomPage.tsx`, the `sportRooms` map *and* the golf-variant branch in `SpectatorPage.tsx`, `getSportIcon()`/`getSportLabel()` in `lib/matches.ts`, and the `SPORTS` / setup steps in `NewMatchPage.tsx`. The two dispatch tables drift easily — spectator view silently falling back to `CustomRoom` is the usual symptom.

`ChipOffRoom.tsx` is the reference implementation for what a complete room looks like — `useMatchEvents` rehydration/live-sync, writes guarded inside the handler (not just disabled JSX), spectator/TV read-only handling, an explicit win condition, and `player_id` always passed to `recordEvent()` so the event actually scores. `PoolRoom.tsx` (the `16_ball`/`8_ball` room) follows the same pattern, plus a pure/testable reducer (`src/lib/pool/poolEngine.ts`, mirroring the darts engines) for group assignment, turn rotation, and win detection — `replayPoolEvents()` folds the persisted event log through it on every render rather than trusting local state, so a mid-match refresh can't desync. [docs/sport-room-template.md](docs/sport-room-template.md) writes the general pattern up as a checklist plus a copy-ready skeleton (`src/components/sports/_TemplateRoom.tsx`, unwired by design) — use it both for new sports and for bringing the remaining thinner rooms (`DartsRoom`, `CustomRoom`, `TableTennisRoom`, `BasketballRoom`, `CardsRoom`) up to this level, see `todo.md`.

Darts sub-games are pure reducers (`createXState` / `applyXThrow` over `DartsRuntimeState`) in `src/lib/darts/`, kept separate from the SVG board geometry in `board.ts`.

### Dashboard match sections are a strict partition, not independent queries

`getMatchDisplayStatus()` in `lib/matches.ts` is the single source of truth for how a match should read to a viewer: `'done'` (status `completed`), `'paused'` (status `paused`, **or** status `active` but `isMatchStale()` — no update in `STALE_MATCH_THRESHOLD_MS`, 4h), or `'live'` (active and not stale). Dashboard's three sections each pull from a different query but must never show the same match twice: `getLiveActivity()` (status `active`, not stale) → Live Activity; `getActiveMatches()` (status `active` or `paused`) filtered to `displayStatus !== 'live'` → Active Matches; `getCompletedMatches()` (status `completed` only) → Recent Matches. `getRecentMatches()` (any status, most recent N by `created_at`) is a different, older function still used by `HistoryPage` for its own client-side status-tab filtering — don't reach for it on the dashboard or conflate the two.

If a room memoizes a function that both reads and sets its own `loading` state (e.g. a guard like `if (loading) return;` inside a `useCallback`), don't put the reactive `loading` value in that callback's dependency array — every toggle recreates the callback, which recreates anything memoized on top of it (in `GolfRoom.tsx`, `loadData`), which can retrigger a mount `useEffect` that calls it again, forever. `GolfRoom.tsx` mirrors `loading` into a `loadingRef` for exactly this reason — the guard reads the ref, the dependency array doesn't include it.

`DartsBoard.tsx`'s SVG `viewBox` is padded to `-24 -24 448 448`, not the `0 0 400 400` the board's own `DARTBOARD_CENTER`/`DARTBOARD_RADIUS` constants (200/190, in `board.ts`) would suggest — number labels sit at radius 205, so a tight viewBox clips them at 12/6 o'clock. The multiplier-menu popup's position is computed from that same `viewBox` origin/size (`VIEWBOX_MIN`/`VIEWBOX_SIZE` in `DartsBoard.tsx`); if the padding ever changes, that math must change with it or the popup lands off-target.

### Shared building blocks — reach for these before writing a new one

- `UserAvatar` (profile-aware: photo, initials fallback, colour) wrapping `Avatar` (low-level primitive). Any surface rendering a real player uses `UserAvatar`.
- `ruleDefinitions.ts` / `statDefinitions.ts` in `src/data/` are the single source of user-facing rule and stat copy, surfaced by `InfoTooltip` and `HouseRulesPanel`. House rules are config in TypeScript, not a database table.
- `LineupOrderBuilder` (turn order at setup) and `TieBreakerChallenge` (PvP tie-breaks; raw distance measurements are ephemeral UI state and deliberately never persisted).
- `Modal`, plus the `.modal-*` classes, for every dialog.
- `generateRoomCode()` in `lib/matches.ts` (8 hex chars from a UUID's first segment) for every new `match_rooms.room_code` — initial creation (`NewMatchPage`) and every room's rematch flow (`CricketRoom`, `DartsRoom`, `ChipOffRoom`) share it. Don't reintroduce a local `Math.random()`-based code.
- `useMatchEvents(matchId)` (`src/hooks/useMatchEvents.ts`) for reading a match's live `match_events` log — see Matches are event-sourced and Realtime above. Don't write a new per-room `loadEvents` + `postgres_changes` subscription from scratch.
- `getProfilesByIds()` in `src/lib/profileCache.ts` for looking up a roster's profiles — session-lifetime cache, avoids re-fetching the same players on every match-room refresh. If you mutate a profile (e.g. a settings/avatar save), call `setProfile()`/`invalidateProfile()` from the same module so the editor's own next read isn't stale.

Names that look plausible but do not exist — don't code against them: there is no standalone `teams` table (use `match_teams` + `match_players.team_id`), no `ledger_entries` table (use `match_events` via `recordEvent()`), no `PlayerAvatar` component, and no separate `sport` enum value for Chip Off or Putt vs Putt. PvP turn order is `match_players.lineup_order` — not a `match_teams` array, and not cricket's `batting_order`.

### Stats pipeline

The leaderboard is computed **live on every load, but the reduction is split across two places** — know which half you're changing. `getGlobalLeaderboardData()` in `src/lib/stats.ts` pulls `match_rooms` (`status = 'completed'`, `is_practice = false`) + the `leaderboard_match_player_scores` view + `profiles`, then derives placement, `season_points` (from `SEASON_POINT_RULES`), lifetime counters and best scores in memory. The per-event half — turning `match_events` into a score — lives in Postgres as of `20260730143009`/`20260730143429`: the view emits one row per (match, roster player) with seven columns (`points`, `runs`, `wickets`, `strokes`, `hio`, `tens`, `holed_putts_total`), and the client no longer fetches `match_events`, `match_players`, or `cricket_player_stats` at all. That's ~5 rows per match instead of ~163 events, measured at a 42x cut in per-match payload.

The view is deliberately faithful to the client code it replaced, quirks included — `cards_round`, `tt_set`, and non-team `custom_score` events carry no `player_id`, no `event_data.player`, and no `team_id`, so routing drops them and they never score at all (tracked as a bug in [todo.md](todo.md), not fixed inside the refactor). There is no stored/cached aggregate the client writes to — `player_career_stats` used to be that cache, but the client stopped writing to it on 2026-07-29 and nothing read it either, so it was dropped outright on 2026-07-30 (`20260730030956_drop_dead_player_career_stats_table.sql`). If a future feature needs a real server-computed cache, it needs a fresh table/migration, not a revival of this name.

Completing a match (`updateMatchStatus('completed')`, `completeMatchWithWinner`, `completeMatchWithTeamWinner`) only does one stats-adjacent thing now: `determineAndSaveWinnerIfMissing(matchId)` backfills `match_rooms.winner_profile_id` for golf matches that reach `'completed'` without an explicit winner — classic golf (`GolfRoom`) has no win-condition button at all, and any sport can be ended early via the generic "End & Lock" header action before its room's own win condition fires. Every other sport's room sets the winner explicitly (`completeMatchWithWinner`/`completeMatchWithTeamWinner`), so this is a golf-specific fallback, not a general recompute. Failures are logged, never thrown, so the match still closes; practice matches are skipped entirely.

Season points come from `SEASON_POINT_RULES` alone — placement 100 / 50 / 25 with 10 for finishing at all, plus milestones (cricket 50+ runs = 50, 3+ wickets = 30; each hole-in-one or Chip Off ace = 50). It's exported so the Leaderboard's explainer modal renders the live values; change the constant, never a hardcoded integer at a call site. In team games every player on the team receives their team's placement points. Chip Off and classic golf deliberately share one unified Golf tab and both increment the same `matches_played` / `matches_won`.

**Making a new event type count toward the leaderboard is now a migration, not a TypeScript edit.** The `event_type` switch that used to live in `stats.ts` is the SQL function `match_event_points(event_type, event_data, profile_id)`; add a `WHEN` branch there, and if the event feeds a counter other than `points` (the way `golf_score` feeds `hio`/`strokes` or `putt_attempt` feeds `holed_putts_total`), add it to `event_totals` in the `leaderboard_match_player_scores` view too. It was extracted into a standalone function specifically so each branch can be unit-tested against synthetic jsonb — `SELECT match_event_points('darts_win', '{"throw":{"scoredPoints":40}}')` — with no rows written anywhere. That matters because the live database only ever holds a handful of event types (three as of 2026-07-30), so most branches have no reachable test data; a differential test against live rows will pass while an untouched branch is wrong. Mirror JS coercion carefully when adding one: `amount || 1` treats an explicit `0` as falsy and scores 1, and that quirk is reproduced in SQL on purpose.

`PoolRoom`'s four event types (`pool_ball_potted`, `pool_miss`, `pool_foul`, `pool_game_won`) have no `match_event_points()` branch yet, so pool matches don't contribute to season points or leaderboard placement beyond the generic `matches_played`/`matches_won` completion bump — see `todo.md`. Group assignment isn't a persisted event at all; it's a pure function of which side pots the table-opening ball (`ballGroupOf()` in `poolEngine.ts`), so a future "win % when Bigs/Smalls" or "win % when broke first" stat needs to replicate that same open-table rule in SQL (or add a dedicated event) rather than assume one exists.

Derived per-player analytics (strike rate, checkout %, scoring efficiency, …) come from the Postgres views `player_career_analytics` and `fan_engagement_stats`, read directly by `ProfilePage`, `LeaderboardPage`, and `PvPRoom` — also independently recomputed from raw tables, not from `player_career_stats`. Changing one of those metrics is a migration, not a TypeScript edit. `STATS_AUDIT_LOG.md` maps each user-facing metric to its column, formula, and storage path.

### Realtime

Rooms and list pages subscribe with `supabase.channel(...).on('postgres_changes', { table, filter: 'match_id=eq.<id>' }, …)` and the handler just refetches — payloads are used as a change signal, not as data. A table must be in the realtime publication to fire (`supabase/migrations/20260724_enable_realtime.sql`). Always `supabase.removeChannel(channel)` on cleanup.

These subscription effects (in `MatchRoomPage.tsx`, `SpectatorPage.tsx`) deliberately depend on `match?.id`/`match?.status`, not the whole `match` object — `match` is a fresh object reference on every refetch, so depending on it directly would tear down and resubscribe the channel (or, for the `active_sessions` writer effect, redundantly clear-then-rewrite `match_id`) far more often than needed. ESLint's `exhaustive-deps` flags this as a missing dependency; the fix is an inline disable comment, not adding `match` to the array.

`useMatchEvents()` (above) still follows "payload as signal, not data" — it queries for what changed on a signal, it doesn't read the payload itself — but adds a resync on the channel's `SUBSCRIBED` status callback (fires on first connect and on reconnect), so a signal missed while a device was disconnected can't leave its delta-synced cache silently stale. The other ad-hoc per-room channels don't have this reconnect safety net.

### Theme and styling

"Prime Time Neon": Tailwind with `darkMode: 'class'`, toggled by `ThemeContext`. The `charcoal.*` scale maps to CSS variables redefined per theme in `src/index.css` — everything else (`accent`, `success`, `danger`, per-sport colors) is fixed hex and does not flip. Reusable component classes (`.card`, `.btn-*`, `.score-btn`, `.pill-*`, `.stat-card`, `.modal-*`) live in `@layer components`; prefer them over rebuilding the same utility stack. Headings get `font-athletic` (Oswald) uppercase italic globally.

Match rooms are `h-[100dvh]` flex columns with absolutely-positioned, transparent scoring trays floating over scrollable content — the layout is deliberate for mobile, don't convert it to `min-h-screen`.

Icons are `lucide-react` only. Don't add UI-theme, component, or icon packages — the design is hand-built on Tailwind by intent, and new surfaces are expected to look production-ready and match the existing aesthetic rather than fall back to generic defaults.

## Database and migrations

`supabase/migrations/`, applied against the linked live project. Read `docs/rls-ground-rules.md` before touching any policy — it was written after a live audit found the anon key could read and write nearly every table. The rules that matter most:

- Policies identify the caller through `get_current_session_profile_id()` (50+ uses) and scope match access with `is_match_participant()`. Reuse those helpers rather than re-deriving identity in a policy body.
- Query `pg_policies` for the live state first; migration files are intent, not truth. Drop *every* leftover permissive policy for the command you're changing — Postgres ORs permissive policies, so one forgotten `USING (true)` defeats every later fix.
- Row-ownership policies don't restrict columns. Privileged columns (`is_admin`, `created_by`, `recorded_by`) need a paired `BEFORE INSERT/UPDATE` guard trigger, and any "who did this" column must be stamped server-side.
- Every `SECURITY DEFINER` function pins `SET search_path = public, pg_temp` and fully qualifies extension calls (`extensions.digest(...)`).
- Any surviving `USING (true)` needs an inline comment justifying it.
- A client-side `ctx.isAdmin` override is only real if the matching RLS policy grants it too — they can silently diverge (found twice in one 2026-07-30 audit: `match_rooms` UPDATE was missing the admin branch its own DELETE policy had, and `can_score_match()` — gating writes on `match_events`, `cricket_innings`, `cricket_player_stats`, `golf_holes`, `golf_scores` — had no admin branch at all). Verify the specific command's policy actually has `is_admin_session()`; don't assume it matches a sibling command's just because they're defined next to each other. Full incident in `docs/fix-history.md`.
- `apply_migration` (the Supabase MCP tool) auto-generates its own version at apply time regardless of what the local file is named — a mismatch with the local filename appears immediately after every use. Run `supabase migration list` right after calling it and rename the local file to match before it compounds. This is the live mechanism behind the migration-drift incidents in `docs/fix-history.md`; when drift is found, `supabase migration repair --status applied <version>` (bookkeeping only, never executes SQL) is the fix — never `db push`/`db reset`, which would actually re-run old files.
- `player_career_stats` no longer exists (dropped `20260730030956`, see Stats pipeline above and `docs/fix-history.md`) — a fresh table/migration would be needed to revive the concept, not a reference to this name.

New migration files need a **unique 14-digit timestamp prefix** (`YYYYMMDDHHMMSS`); date-only prefixes collided and broke CLI history once already. Core tables (`profiles`, `match_rooms`, …) were created via the Supabase dashboard and have no `CREATE TABLE` anywhere in this repo — the live database is the only source of truth for their full shape. New tables should always get a migration-tracked `CREATE TABLE`.

See [todo.md](todo.md) for known gaps, tech debt, and planned work, and [docs/fix-history.md](docs/fix-history.md) for completed fixes and the incidents behind them.
