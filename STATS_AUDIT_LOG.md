# Web App Metrics & Tracking Audit Log

## Storage Mechanism Overview
- **Local Storage**: Not used for stats. `localStorage` is only used for authentication tokens (`sk_user` and `sk_session_id`).
- **Live State**: Managed via React Component State (e.g., `DartsRuntimeState`, `playerMap`) and Contexts.
- **Persistence**: Saved directly to a Supabase Postgres database. Raw events go into `match_events`, while aggregations happen in `src/lib/stats.ts` and are written to `player_career_stats`. Advanced analytics are computed on the fly using a Postgres View (`player_career_analytics`).

---

## Cricket

* **Strike Rate**
  * Backend State Variable: `strike_rate`
  * Exact Live Calculation: `(total_cricket_runs / total_cricket_balls_faced) * 100`
  * Web Storage Mechanism: React State -> Supabase View (`player_career_analytics`)

* **Dot Ball Percentage**
  * Backend State Variable: `dot_ball_percentage`
  * Exact Live Calculation: `(total_cricket_dots_faced / total_cricket_balls_faced) * 100`
  * Web Storage Mechanism: React State -> Supabase View (`player_career_analytics`)

* **Boundary Percentage**
  * Backend State Variable: `boundary_percentage`
  * Exact Live Calculation: `((total_fours * 4 + total_sixes * 6) / total_cricket_runs) * 100`
  * Web Storage Mechanism: React State -> Supabase View (`player_career_analytics`)

* **Economy Rate**
  * Backend State Variable: `economy_rate`
  * Exact Live Calculation: `total_cricket_runs_conceded / (total_cricket_balls_bowled / 6)`
  * Web Storage Mechanism: React State -> Supabase View (`player_career_analytics`)

* **Bowling Strike Rate**
  * Backend State Variable: `bowling_strike_rate`
  * Exact Live Calculation: `total_cricket_balls_bowled / total_cricket_wickets_taken`
  * Web Storage Mechanism: React State -> Supabase View (`player_career_analytics`)

---

## Chip Off (Golf Variant)

* **Scoring Efficiency**
  * Backend State Variable: `scoring_efficiency`
  * Exact Live Calculation: `(total_chip_off_points / (total_chip_off_chips * 10)) * 100`
  * Web Storage Mechanism: `match_events` (type: `chip_off_score`) -> Supabase View (`player_career_analytics`)

* **Ace Frequency**
  * Backend State Variable: `ace_frequency`
  * Exact Live Calculation: `(total_aces / total_chip_off_chips) * 100` *(Note: Aces are 10-point scoring events)*
  * Web Storage Mechanism: `match_events` (type: `chip_off_score`) -> Supabase View (`player_career_analytics`)

* **Hazard Avoidance**
  * Backend State Variable: `hazard_avoidance_rating`
  * Exact Live Calculation: `(scoring_chips / total_chip_off_chips) * 100`
  * Web Storage Mechanism: `match_events` (type: `chip_off_score`) -> Supabase View (`player_career_analytics`)

* **Average Proximity Tier**
  * Backend State Variable: `average_proximity_tier`
  * Exact Live Calculation: `total_chip_off_points / total_chip_off_chips`
  * Web Storage Mechanism: `match_events` (type: `chip_off_score`) -> Supabase View (`player_career_analytics`)

---

## Darts

* **Total Darts Thrown**
  * Backend State Variable: `darts_thrown`
  * Exact Live Calculation: `eventData.darts.length` (Summed up over all `darts_turn` / `darts_throw` events)
  * Web Storage Mechanism: `match_events` -> `stats.ts` (`extra_stats` JSON column in `player_career_stats`)

* **Checkout / Double Out Finishes**
  * Backend State Variable: `double_out_finishes`
  * Exact Live Calculation: Increments by `1` if `e.event_data.throw?.ring === 'double'` or `'double_bull'` upon `darts_win`
  * Web Storage Mechanism: `match_events` -> `stats.ts` (`extra_stats` JSON column)

* **Around The World - Advances**
  * Backend State Variable: `atw_advances`
  * Exact Live Calculation: `e.event_data.advanced_by` (Usually `1`, or multiplier value if 'Skip Ahead' is enabled)
  * Web Storage Mechanism: `match_events` (type: `darts_atw_throw`) -> `stats.ts` (`extra_stats` JSON column)

* **Around The World - Successful Hits**
  * Backend State Variable: `atw_successful_hits`
  * Exact Live Calculation: Increments by `1` if `e.event_data.hit_target === true`
  * Web Storage Mechanism: `match_events` (type: `darts_atw_throw`) -> `stats.ts` (`extra_stats` JSON column)

* **Killer - Activations**
  * Backend State Variable: `killer_activations`
  * Exact Live Calculation: Increments by `1` if `e.event_data.activated === true`
  * Web Storage Mechanism: `match_events` (type: `darts_killer_throw`) -> `stats.ts` (`extra_stats` JSON column)

* **Killer - Opponent Lives Removed**
  * Backend State Variable: `killer_opponent_lives_removed`
  * Exact Live Calculation: Increments by `1` if `e.event_data.hit_opponent_id` is truthy
  * Web Storage Mechanism: `match_events` (type: `darts_killer_throw`) -> `stats.ts` (`extra_stats` JSON column)

* **Killer - Eliminations Secured**
  * Backend State Variable: `killer_eliminations_secured`
  * Exact Live Calculation: `e.event_data.eliminated_player_ids.length` (excluding self)
  * Web Storage Mechanism: `match_events` (type: `darts_killer_throw`) -> `stats.ts` (`extra_stats` JSON column)