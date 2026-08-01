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

* **50s (Career Fifties)**
  * Exact Live Calculation: count of `cricket_player_stats` rows (one per innings batted) where `scored_fifty` is true and `scored_century` is false. Deliberately exclusive of centuries — standard cricket scorecard convention, and necessary here since `CricketRoom.tsx` also flips `scored_fifty` true the moment `scored_century` is set, so a naive count of `scored_fifty` alone would double-count every century as a fifty too.
  * Web Storage Mechanism: `scored_fifty`/`scored_century` are written per-innings by `CricketRoom.tsx`'s `handleDelivery` the moment a batter's cumulative `bat_runs` crosses 50/100; aggregated into a career count by the `player_career_analytics` Postgres view (`20260801223517_cricket_career_fifties_centuries.sql`)

* **100s (Career Centuries)**
  * Exact Live Calculation: count of `cricket_player_stats` rows where `scored_century` is true
  * Web Storage Mechanism: same as above

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

The six stats below all live on `player_career_analytics` instead of `leaderboard_match_player_scores` — that's the view `ProfilePage.tsx` actually reads (`GlobalPlayerStats`/`leaderboard_match_player_scores` only feeds `LeaderboardPage`). `ProfilePage.tsx`'s Pool "Advanced Analytics" tile block and the Compare Modal's `'pool'` entry both render all six, plus Win % Bigs/Smalls/Broke pulled from `leaderboard_match_player_scores`'s `pool_group`/`pool_broke_first` via a join rather than re-derived — one source of truth for that logic. Added in `supabase/migrations/20260801211316_pool_career_analytics.sql`.

* **Fouls**
  * Exact Live Calculation: `COUNT(*)` of `pool_foul` events per player, per match, summed across all their pool matches.
  * Web Storage Mechanism: `player_career_analytics`'s `pool_shot_counts` CTE → `total_pool_fouls`, read into memory by `ProfilePage.tsx`'s `loadStats()`.

* **Average Shots per Pot**
  * Exact Live Calculation: `(pool_ball_potted + pool_miss + pool_foul events by this player) / (their own-group pool_ball_potted count)`, lower is better — mirrors `poolEngine.ts`'s in-match `potsBySide`/`missesBySide`/`foulsBySide` bookkeeping, aggregated across matches instead of reset per game.
  * Web Storage Mechanism: `player_career_analytics`'s `pool_shot_counts` CTE → `pool_avg_shots_per_pot`.

* **Wire-to-wire clean run**
  * Exact Live Calculation: count of matches won with zero `pool_miss`/`pool_foul` events on this player's side.
  * Web Storage Mechanism: `player_career_analytics` → `pool_wire_to_wire_wins`, computed from `pool_shot_counts` joined against `player_match_status.is_win`.

* **Longest Pot Streak**
  * Exact Live Calculation: the longest run of consecutive own-group pots within one continuous turn, career-best. Computed via a gaps-and-islands query: a running `SUM() OVER (ORDER BY sequence_num)` increments on every turn-ending event (`pool_miss`/`pool_foul`/potting the opponent's ball — the same three cases `poolEngine.ts`'s `endTurn()` fires on), assigning every event a stable `turn_group` id that's constant within one turn and higher for every subsequent one; then `MAX` of own-ball pots per `(match, player, turn_group)`.
  * Web Storage Mechanism: `player_career_analytics`'s `pool_streaks` CTE → `pool_longest_streak`.

* **Shortest game (fewest total shots to win)**
  * Exact Live Calculation: fewest total shots (`pool_ball_potted`/`pool_miss`/`pool_foul`, both sides combined) across matches this player won — mirrors golf's `best_score_classic` personal-best pattern in `stats.ts`. `NULL` if the player has never won a pool match.
  * Web Storage Mechanism: `player_career_analytics`'s `pool_match_shot_counts` CTE (per-match total) → `MIN(...) FILTER (WHERE is_win)` → `pool_shortest_win_shots`.

* **Bigs/Smalls assignment count**
  * Exact Live Calculation: raw count of matches played as each group, read off `pool_group` (see win-% entry above) independent of outcome.
  * Web Storage Mechanism: `player_career_analytics` → `pool_matches_as_bigs`/`pool_matches_as_smalls`, joined in from `leaderboard_match_player_scores`.

---

## Darts

Only one live pipeline covers darts today:

* **Derived rate stats** (`countdown_ppr`, `first_nine_ppr`, `checkout_pct`, `atw_efficiency`, `killer_lethality`, `killer_survival`) are computed live by the `player_career_analytics` Postgres view from `match_events`, read by `ProfilePage`.

**Dropped, not just relocated:** earlier versions of this doc also listed a second pipeline — raw per-throw counts (`darts_thrown`, `checkouts`/double-out finishes, ATW advances/successful hits, Killer activations/opponent-lives-removed/eliminations-secured) re-derived by `getGlobalLeaderboardData()` into an in-memory `extra_stats` field. That field no longer exists: the 2026-07-30 P0 perf rewrite replaced `getGlobalLeaderboardData()`'s direct `match_events`/`match_players`/`cricket_player_stats` reads and `event_type` switch with the pre-reduced `leaderboard_match_player_scores` view (see `src/lib/stats.ts`, `GlobalPlayerStats`). Per the comment there, these counters were "recomputed on every leaderboard load and read by nothing" — `LeaderboardPage` never touched `extra_stats` — so they were cut outright rather than migrated. None of them are rendered anywhere in the current UI; if darts per-throw counters are needed again, they'd need a fresh column on the view or a dedicated query, not a reference to this dropped field.
