# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on :5173 (use preview_start {name: "dev"} — .claude/launch.json)
npm run dev:host     # same, exposed on the LAN for phone testing
npm run typecheck    # tsc --noEmit -p tsconfig.app.json
npm run lint         # eslint .
npm run build        # vite build -> dist/
```

- **`npm run build` does not typecheck** — it's `vite build` alone. `npm run typecheck` is the real gate; run it after any non-trivial edit.
- **Lint is dirty at baseline** (~66 errors, ~9 warnings, mostly `@typescript-eslint/no-explicit-any`). Don't treat a clean run as the bar; just don't add new categories of error.
- **There is no test suite** — no test runner is installed. Verification means typecheck + lint + actually driving the app in the browser preview.
- **Deploying is a separate action from committing.** Production (Cloudflare Pages) has no git integration; `git push` never updates the live site. See `.claude/skills/deploy-production/SKILL.md`.
- For browser QA, log in as the existing test account (`claudetester` / PIN `1234`) rather than signing up a new one — every signup becomes a real profile on the shared leaderboard. If the app is already logged in, keep using that session.
- `dev:host` exists for testing on a phone over the LAN; both devices must be on the same Wi-Fi and the host firewall must allow the port.

## Environment

`.env` supplies `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. There is no local Supabase stack and no `supabase/config.toml` — the app and the migrations both point at one shared live project, so schema changes are immediately real for every user.

## Repo hygiene — external tooling history

This app was iterated on through several AI coding tools before consolidating on Claude Code — `.trae/`, `.bolt/`, and `.cursor` existed for that reason (durable content merged into this file, directories removed 2026-07-26).

That history was a live risk, not just clutter: on 2026-07-26, `src/contexts/AuthContext.tsx` and `src/components/sports/TableTennisRoom.tsx` were found silently reverted to older versions on disk at the start of a session — Bolt.new was still connected to this repo and had overwritten both files locally. The reverted `AuthContext.tsx` reintroduced the session-forgery hole the current version's own comments warn about (recovering a session from a cached profile id instead of `rpc_resume_session`) plus a `select('*')` on `profiles` that fails outright now that `pin_hash` is revoked. `npm run typecheck` caught it immediately via an unrelated-looking argument-count error in `LoginPage.tsx` — that command is the fast tripwire for this class of problem.

Bolt's Supabase connection has been disconnected, and Bolt, Lovable, and Cursor have all had their GitHub access to this repo revoked (2026-07-26), closing this specific vector. Even so: if `git status` shows unexplained modifications at the start of a session — especially to auth/security-sensitive files — don't assume they're the user's in-progress work. Check `git log`/`git diff` against `HEAD` and confirm with the user before building on top of them.

## Architecture

React 18 + TypeScript + Vite SPA, Tailwind, react-router, Supabase (Postgres + Realtime + Storage). No state library — React Context (`AuthContext`, `ThemeContext`) plus per-page `useState`.

### Auth is custom, not Supabase Auth

Identity is a `profiles` row plus a 4-digit PIN. There are no Supabase JWTs.

- `src/lib/supabase.ts` wraps `fetch` to attach an `x-session-id` header (from `localStorage.sk_session_id`) to **every** request. RLS policies resolve the caller from that header via `get_current_session_profile_id()`. The wrapper must *merge* into existing headers — replacing them strips the apikey and breaks the whole app.
- Login/signup/resume go through `SECURITY DEFINER` RPCs (`rpc_login`, `rpc_signup`, `rpc_resume_session`). Never hash or compare `pin_hash` in client code, and never `INSERT` into `active_sessions` directly — proving identity and minting a session must stay atomic in one RPC.
- `profiles.pin_hash` is revoked from anon/authenticated. **Never `select('*')` (or bare `select()`) on `profiles`** — Postgres expands `*` to every column and fails the whole query on the revoked one. Use `SAFE_PROFILE_COLUMNS`, including in `.insert(...).select(...)` / `.update(...).select(...)` chains.
- `localStorage`: `sk_user` (sanitized profile) and `sk_session_id`. A 30s heartbeat updates `active_sessions.last_seen`.

### Matches are event-sourced

`match_rooms` (`room_code`, `sport`, `house_rules` JSON, `custom_config` JSON) → `match_teams` / `match_players` → `match_events` (append-only, `sequence_num`, soft undo via `is_undone`). Write through `recordEvent()` / `undoLastEvent()` in `src/lib/matches.ts`.

Only cricket (`cricket_innings`, `cricket_player_stats`) and golf (`golf_holes`, `golf_scores`) have normalized side tables. **Every other sport's score exists only in `match_events`**, so those rooms must rehydrate their local state from `match_events` on mount or a refresh mid-match shows 0–0.

`deleteMatch()` clears dependents explicitly in a fixed order — there's no DB cascade, and `comments` is polymorphic (`context_type`/`context_id`) so it has no FK at all.

### Sport rooms

Every scoring UI is `({ ctx }: { ctx: MatchContext })`, with `MatchContext` exported from `src/pages/MatchRoomPage.tsx`. Rooms must honour `ctx.isSpectator` / `ctx.isTvDisplayMode` (disable all input) and refuse writes unless `match.status === 'active'` or `ctx.isAdmin`.

Variants live in `house_rules.variant`, not in `sport`:

| sport | variant | component |
|---|---|---|
| `golf` | `chip_off` | `ChipOffRoom` |
| `golf` | `putt_vs_putt` | `PvPRoom` |
| `cricket` | `backyard` | `CricketRoom` via `ctx.isBackyard` |
| `darts` | `countdown` / `around_the_world` / `killer` | `DartsRoom` + engines in `src/lib/darts/` |

**Adding a sport or variant touches four places**: `getSportRoom()` in `MatchRoomPage.tsx`, the `sportRooms` map *and* the golf-variant branch in `SpectatorPage.tsx`, `getSportIcon()`/`getSportLabel()` in `lib/matches.ts`, and the `SPORTS` / setup steps in `NewMatchPage.tsx`. The two dispatch tables drift easily — spectator view silently falling back to `CustomRoom` is the usual symptom.

Darts sub-games are pure reducers (`createXState` / `applyXThrow` over `DartsRuntimeState`) in `src/lib/darts/`, kept separate from the SVG board geometry in `board.ts`.

### Shared building blocks — reach for these before writing a new one

- `UserAvatar` (profile-aware: photo, initials fallback, colour) wrapping `Avatar` (low-level primitive). Any surface rendering a real player uses `UserAvatar`.
- `ruleDefinitions.ts` / `statDefinitions.ts` in `src/data/` are the single source of user-facing rule and stat copy, surfaced by `InfoTooltip` and `HouseRulesPanel`. House rules are config in TypeScript, not a database table.
- `LineupOrderBuilder` (turn order at setup) and `TieBreakerChallenge` (PvP tie-breaks; raw distance measurements are ephemeral UI state and deliberately never persisted).
- `Modal`, plus the `.modal-*` classes, for every dialog.

Names that look plausible but do not exist — don't code against them: there is no standalone `teams` table (use `match_teams` + `match_players.team_id`), no `ledger_entries` table (use `match_events` via `recordEvent()`), no `PlayerAvatar` component, and no separate `sport` enum value for Chip Off or Putt vs Putt. PvP turn order is `match_players.lineup_order` — not a `match_teams` array, and not cricket's `batting_order`.

### Stats pipeline

Completing a match (`updateMatchStatus('completed')`, `completeMatchWithWinner`, `completeMatchWithTeamWinner`) fires `updateCareerStats(matchId)`, which replays `aggregateMatchStats()` over `match_events` + the cricket/golf tables and upserts `player_career_stats` (lifetime counters, `extra_stats` JSON, and `season_points` from `SEASON_POINT_RULES`). Failures are logged, never thrown, so the match still closes; practice matches are skipped entirely.

Season points come from `SEASON_POINT_RULES` alone — placement 100 / 50 / 25 with 10 for finishing at all, plus milestones (cricket 50+ runs = 50, 3+ wickets = 30; each hole-in-one or Chip Off ace = 50). It's exported so the Leaderboard's explainer modal renders the live values; change the constant, never a hardcoded integer at a call site. In team games every player on the team receives their team's placement points. Chip Off and classic golf deliberately share one unified Golf tab and both increment the same `matches_played` / `matches_won`.

`src/lib/stats.ts` carries **two near-identical `event_type` switches** — one inside `aggregateMatchStats()` (~line 356) and one inside `getGlobalLeaderboardData()` (~line 743). A new event type that should count toward stats must be added to both, or the leaderboard and the profile page will disagree.

Derived per-player analytics (strike rate, checkout %, scoring efficiency, …) come from the Postgres views `player_career_analytics` and `fan_engagement_stats`, read directly by `ProfilePage`, `LeaderboardPage`, and `PvPRoom`. Changing one of those metrics is a migration, not a TypeScript edit. `STATS_AUDIT_LOG.md` maps each user-facing metric to its column, formula, and storage path.

### Realtime

Rooms and list pages subscribe with `supabase.channel(...).on('postgres_changes', { table, filter: 'match_id=eq.<id>' }, …)` and the handler just refetches — payloads are used as a change signal, not as data. A table must be in the realtime publication to fire (`supabase/migrations/20260724_enable_realtime.sql`). Always `supabase.removeChannel(channel)` on cleanup.

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

New migration files need a **unique 14-digit timestamp prefix** (`YYYYMMDDHHMMSS`); date-only prefixes collided and broke CLI history once already. Core tables (`profiles`, `match_rooms`, …) were created via the Supabase dashboard and have no `CREATE TABLE` anywhere in this repo — the live database is the only source of truth for their full shape. New tables should always get a migration-tracked `CREATE TABLE`.

### Migration history has drifted from live twice — check before trusting it

The local folder and the remote `schema_migrations` ledger have gone out of sync twice: 2026-07-23 (colliding date-only prefixes plus ~30 files applied by hand-pasting into the dashboard, with no local record at all) and 2026-07-26 (more of the same, plus `apply_migration` — see below). Both were fixed the same way: verify each file's real effect against live `pg_policies`/`pg_indexes` first, rename it to a unique 14-digit timestamp reflecting when it actually happened (from git blame/commit content, never guessed), then `supabase migration repair --status applied <version>` — bookkeeping only, it never executes SQL. That last part matters: several of the files reconciled on 2026-07-26 (`fix_active_sessions_rls.sql`, `fix_rls_for_custom_auth.sql`, now dated `20260626`/`20260702`) create the exact `USING (true)` policies the RLS lockdown later removed — actually re-running them via `db push`/`db reset` would reopen that hole, which is exactly why `repair` (bookkeeping-only) and never `push` is the right tool for closing gaps like this.

`apply_migration` (the Supabase MCP tool) is a live source of this drift, not just something that fixes it: it auto-generates its own version at apply time regardless of what the local file is named, so a mismatch appears immediately after every use. Run `supabase migration list` right after calling it and rename the local file to match before it compounds.

## Known gaps

- Rematch flows in `CricketRoom`, `DartsRoom`, and `ChipOffRoom` still mint room codes with `Math.random()`; the `NewMatchPage` path uses `crypto.randomUUID()`.
- `player_career_stats` writes are client-computed and scoped to the caller's own `profile_id` — a player can misreport their own numbers (not other players').
- Matches abandoned mid-game stay "LIVE" in the DB; `isMatchStale()` (4h) only filters them out of the Dashboard's Live Activity list.
- Post-completion editing is inconsistent across sport rooms — some restrict scoring to `status === 'active'` without an admin exception, `GolfRoom` allows any non-spectator to edit a completed match. Deleting a match is admin-only by design, even for its creator.
