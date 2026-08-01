# Web App Metrics & Tracking Audit Log

## Storage Mechanism Overview
- **Local Storage**: Not used for stats. `localStorage` is only used for authentication tokens (`sk_user` and `sk_session_id`).
- **Live State**: Managed via React Component State (e.g., `DartsRuntimeState`, `playerMap`) and Contexts.
- **Persistence**: Raw events go into `match_events` (append-only), with cricket and golf additionally normalized into `cricket_player_stats` / `golf_scores`. Nothing computed from them is written back anywhere — there is no career-stats cache table. Two independent pipelines re-derive everything live, on every read, straight from those raw tables:
  1. `getGlobalLeaderboardData()` in `src/lib/stats.ts` — powers the global leaderboard. Pulls `match_rooms` (`status = 'completed'`) + the `leaderboard_match_player_scores` view + `profiles`, and re-derives lifetime counters and `season_points` in memory, per request. Until the 2026-07-30 P0 perf rewrite it instead pulled `match_players`/`match_events`/`cricket_player_stats` directly and derived a per-sport raw-count `extra_stats` field via an in-memory `event_type` switch; that field was dropped outright (nothing read it) — see the Darts section below.
  2. The Postgres views `player_career_analytics` and `fan_engagement_stats` — power derived/rate analytics (strike rate, checkout %, scoring efficiency, …) read directly by `ProfilePage`, `LeaderboardPage`, and `PvPRoom`. Recomputed on every `SELECT`, straight from `match_events`/`cricket_player_stats`/`match_players`/`match_rooms` — not from `getGlobalLeaderboardData()`'s output.
  
  A table called `player_career_stats` used to sit downstream of the client as a write-through cache; the client stopped writing to it 2026-07-29 and nothing ever read it back, so it was dropped outright 2026-07-30 (`supabase/migrations/20260730030956_drop_dead_player_career_stats_table.sql`). Any reference to it below in an older version of this doc was stale.

---

## Cricket

* **Strike Rate**
  * Exact Live Calculation: `(total_cricket_runs / total_cricket_balls_faced) * 100`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `cricket_player_stats`

* **Dot Ball Percentage**
  * Exact Live Calculation: `(total_cricket_dots_faced / total_cricket_balls_faced) * 100`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `cricket_player_stats`

* **Boundary Percentage**
  * Exact Live Calculation: `((total_fours * 4 + total_sixes * 6) / total_cricket_runs) * 100`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `cricket_player_stats`

* **Economy Rate**
  * Exact Live Calculation: `total_cricket_runs_conceded / (total_cricket_balls_bowled / 6)`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `cricket_player_stats`

* **Bowling Strike Rate**
  * Exact Live Calculation: `total_cricket_balls_bowled / total_cricket_wickets_taken`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `cricket_player_stats`

---

## Chip Off (Golf Variant)

* **Scoring Efficiency**
  * Exact Live Calculation: `(total_chip_off_points / (total_chip_off_chips * 10)) * 100`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `match_events` (type: `chip_off_score`)

* **Ace Frequency**
  * Exact Live Calculation: `(total_aces / total_chip_off_chips) * 100` *(Note: Aces are 10-point scoring events)*
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `match_events` (type: `chip_off_score`)

* **Hazard Avoidance**
  * Exact Live Calculation: `(scoring_chips / total_chip_off_chips) * 100`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `match_events` (type: `chip_off_score`)

* **Average Proximity Tier**
  * Exact Live Calculation: `total_chip_off_points / total_chip_off_chips`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `match_events` (type: `chip_off_score`)

---

## Putt vs Putt (Golf Variant)

* **Career Holed %**
  * Exact Live Calculation: `(holed_putts_total / total_putt_attempts) * 100`
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `match_events` (type: `putt_attempt`)

* **Clutch Putts**
  * Exact Live Calculation: `COUNT(*)` of the player's own `tiebreak_result` events for the match
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `match_events` (type: `tiebreak_result`)

---

## Pool (16 Ball / 8 Ball)

* **Matches Played / Won / Lost**
  * Exact Live Calculation: incremented per completed match from `match_rooms.winner_profile_id`/`winner_team_id` (set by `PoolRoom.tsx` calling `completeMatchWithWinner`/`completeMatchWithTeamWinner` on a legal or illegal-black finish) — same generic mechanism every sport uses, not pool-specific.
  * Web Storage Mechanism: in-memory only, recomputed by `getGlobalLeaderboardData()` in `src/lib/stats.ts` on every leaderboard load.

* **Season Points (placement contribution)**
  * Exact Live Calculation: `match_event_points()` scores `pool_ball_potted` as 1 point when `event_data.own_ball` is `true` (0 otherwise), `pool_game_won` as a flat 7-point winner bonus, `pool_miss`/`pool_foul` as 0. Summed per player into the `points` column, which `getGlobalLeaderboardData()` uses as the ranking `score` for placement (100/50/25/10 via `calculatePlacementSP`) — same as every non-cricket/non-golf sport. No pool-specific milestone bonus exists.
  * Web Storage Mechanism: computed live by `match_event_points()` + the `leaderboard_match_player_scores` view's `points` column (`supabase/migrations/20260801124346_score_pool_ball_tracking_events.sql`), read into memory by `getGlobalLeaderboardData()`.

* **Win % when Bigs vs Win % when Smalls**
  * Exact Live Calculation: the view's `pool_group` column identifies which group (`bigs`/`smalls`) each roster player played as, read directly off the match's first non-8 `pool_ball_potted` event's `event_data.group` (whoever pots first opens the table and is assigned that ball's group — see `poolEngine.ts`'s `applyPoolPot`); the opposite roster side gets the other group. `NULL` for both sides if the match ended via an illegal early-black foul before the table ever opened, or for legacy `pool_frame`-only matches with no ball-tracking events at all. `getGlobalLeaderboardData()` tallies `pool_matches_as_bigs`/`pool_wins_as_bigs` and `pool_matches_as_smalls`/`pool_wins_as_smalls` per player across all their pool matches; `LeaderboardPage.tsx`'s Pool tab renders each as a win percentage.
  * Web Storage Mechanism: computed live by the `leaderboard_match_player_scores` view's `pool_group` column (`supabase/migrations/20260801133346_pool_group_and_break_stats.sql`), read into memory by `getGlobalLeaderboardData()`.

* **Win % when broke first**
  * Exact Live Calculation: the view's `pool_broke_first` column is `true` for whichever roster player/team owns the match's earliest live event among `pool_ball_potted`/`pool_miss`/`pool_foul` (side 0 always shoots first per `poolEngine.ts`'s `createPoolState`), `false` for the other side, `NULL` for legacy `pool_frame`-only matches. `getGlobalLeaderboardData()` tallies `pool_matches_broke_first`/`pool_wins_broke_first`; the Pool tab renders it as a win percentage alongside the group splits.
  * Web Storage Mechanism: computed live by the `leaderboard_match_player_scores` view's `pool_broke_first` column (`supabase/migrations/20260801133346_pool_group_and_break_stats.sql`), read into memory by `getGlobalLeaderboardData()`.

**Not yet implemented** — discussed as ideas, no code path exists for any of these. Would each need either a new column on `leaderboard_match_player_scores` (or a dedicated view) and `GlobalPlayerStats` wiring, or in some cases a new persisted event — see `todo.md`'s "Pool: leaderboard/season-points wiring" future-features item:

* **Fouls (times potted the white)** — raw count of `pool_foul` events per player exists in `match_events` today; no aggregate column or UI surfaces it.
* **Pot Streak (most potted in one turn)** — `poolEngine.ts`'s `longestStreakBySide` computes this live, in-match, for the win-screen summary card only; nothing persists it or aggregates it across matches.
* **Average Shots per Pot** — would be `(pool_ball_potted + pool_miss + pool_foul) / pool_ball_potted` per player, aggregated across matches; no such column exists.
* **Wire-to-wire clean run** (won without ever missing or fouling) — derivable per-match from the winner having zero `pool_miss`/`pool_foul` events, but not currently checked or counted anywhere.
* **Bigs/Smalls assignment count** (how often a player has played each group, independent of win rate) — the `pool_group` column now carries this fact (see win-% entry above), so this would just be a `pool_matches_as_bigs`/`pool_matches_as_smalls` display, both of which `getGlobalLeaderboardData()` already tallies; only the UI presentation is missing.
* **Shortest game (fewest total shots to win)** — derivable from the completed match's event count, but no query or UI does this today.

---

## Darts

Only one live pipeline covers darts today:

* **Derived rate stats** (`countdown_ppr`, `first_nine_ppr`, `checkout_pct`, `atw_efficiency`, `killer_lethality`, `killer_survival`) are computed live by the `player_career_analytics` Postgres view from `match_events`, read by `ProfilePage`.

**Dropped, not just relocated:** earlier versions of this doc also listed a second pipeline — raw per-throw counts (`darts_thrown`, `checkouts`/double-out finishes, ATW advances/successful hits, Killer activations/opponent-lives-removed/eliminations-secured) re-derived by `getGlobalLeaderboardData()` into an in-memory `extra_stats` field. That field no longer exists: the 2026-07-30 P0 perf rewrite replaced `getGlobalLeaderboardData()`'s direct `match_events`/`match_players`/`cricket_player_stats` reads and `event_type` switch with the pre-reduced `leaderboard_match_player_scores` view (see `src/lib/stats.ts`, `GlobalPlayerStats`). Per the comment there, these counters were "recomputed on every leaderboard load and read by nothing" — `LeaderboardPage` never touched `extra_stats` — so they were cut outright rather than migrated. None of them are rendered anywhere in the current UI; if darts per-throw counters are needed again, they'd need a fresh column on the view or a dedicated query, not a reference to this dropped field.
