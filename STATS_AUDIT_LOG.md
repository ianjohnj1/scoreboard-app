# Web App Metrics & Tracking Audit Log

## Storage Mechanism Overview
- **Local Storage**: Not used for stats. `localStorage` is only used for authentication tokens (`sk_user` and `sk_session_id`).
- **Live State**: Managed via React Component State (e.g., `DartsRuntimeState`, `playerMap`) and Contexts.
- **Persistence**: Raw events go into `match_events` (append-only), with cricket and golf additionally normalized into `cricket_player_stats` / `golf_scores`. Nothing computed from them is written back anywhere — there is no career-stats cache table. Two independent pipelines re-derive everything live, on every read, straight from those raw tables:
  1. `getGlobalLeaderboardData()` in `src/lib/stats.ts` — powers the global leaderboard. Pulls `match_rooms` (`status = 'completed'`) + `match_players` + `match_events` + `cricket_player_stats` + `profiles`, and re-derives lifetime counters, `extra_stats` (per-sport raw counts), and `season_points` in one `event_type` switch, in memory, per request.
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
  * Web Storage Mechanism: computed live by the `player_career_analytics` Postgres view from `match_events` (types: `putt_attempt`, `tiebreak_result`)

---

## Darts

Two separate pipelines cover darts, for two separate surfaces:

* **Raw per-throw counts** (`darts_thrown`, `checkouts`, `double_out_finishes`, ATW/Killer attempt & success counts) are re-derived by `getGlobalLeaderboardData()` in `src/lib/stats.ts` on every leaderboard load, from `match_events`, and returned as the in-memory `extra_stats` field on each player's `GlobalPlayerStats` — nothing is persisted.
* **Derived rate stats** (`countdown_ppr`, `first_nine_ppr`, `checkout_pct`, `atw_efficiency`, `killer_lethality`, `killer_survival`) are computed live by the `player_career_analytics` Postgres view, read by `ProfilePage`.

* **Total Darts Thrown**
  * Exact Live Calculation: `eventData.darts.length` (Summed up over all `darts_turn` / `darts_throw` events)
  * Web Storage Mechanism: `match_events` -> `getGlobalLeaderboardData()` in `stats.ts` (in-memory `extra_stats`, not persisted)

* **Checkout / Double Out Finishes**
  * Exact Live Calculation: Increments by `1` if `e.event_data.throw?.ring === 'double'` or `'double_bull'` upon `darts_win`
  * Web Storage Mechanism: `match_events` -> `getGlobalLeaderboardData()` in `stats.ts` (in-memory `extra_stats`)

* **Around The World - Advances**
  * Exact Live Calculation: `e.event_data.advanced_by` (Usually `1`, or multiplier value if 'Skip Ahead' is enabled)
  * Web Storage Mechanism: `match_events` (type: `darts_atw_throw`) -> `getGlobalLeaderboardData()` in `stats.ts` (in-memory `extra_stats`)

* **Around The World - Successful Hits**
  * Exact Live Calculation: Increments by `1` if `e.event_data.hit_target === true`
  * Web Storage Mechanism: `match_events` (type: `darts_atw_throw`) -> `getGlobalLeaderboardData()` in `stats.ts` (in-memory `extra_stats`)

* **Killer - Activations**
  * Exact Live Calculation: Increments by `1` if `e.event_data.activated === true`
  * Web Storage Mechanism: `match_events` (type: `darts_killer_throw`) -> `getGlobalLeaderboardData()` in `stats.ts` (in-memory `extra_stats`)

* **Killer - Opponent Lives Removed**
  * Exact Live Calculation: Increments by `1` if `e.event_data.hit_opponent_id` is truthy
  * Web Storage Mechanism: `match_events` (type: `darts_killer_throw`) -> `getGlobalLeaderboardData()` in `stats.ts` (in-memory `extra_stats`)

* **Killer - Eliminations Secured**
  * Exact Live Calculation: `e.event_data.eliminated_player_ids.length` (excluding self)
  * Web Storage Mechanism: `match_events` (type: `darts_killer_throw`) -> `getGlobalLeaderboardData()` in `stats.ts` (in-memory `extra_stats`)
