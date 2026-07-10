## Summary

Perform a code audit of how match statistics are currently calculated and stored in the live web application for Cricket, Chip Off, and Darts. Extract all tracking schemas and generate a unified `STATS_AUDIT_LOG.md` document in the project root.

## Current State Analysis

Based on the codebase exploration:

* **Storage Mechanism**: The application does **not** use `localStorage` for match statistics, history, or tracking payloads. `localStorage` is exclusively used for session/auth tokens (`sk_user`, `sk_session_id`). Instead, live tracking relies on React state/context and persists directly to a PostgreSQL backend (Supabase) via the `match_events` table and specialized tables like `cricket_player_stats` and `golf_scores`.

* **Cricket Tracking**: Granular tracking using `runs`, `wickets`, `balls_faced`, and `dots_bowled`. Metrics like Strike Rate and Economy are computed via SQL views (`player_career_analytics`).

* **Chip Off Tracking**: Points (2, 5, 10), aces (10s), and total chips are aggregated from `chip_off_score` events.

* **Darts Tracking**: Extensive event-based tracking (`darts_turn`, `darts_bust`, `darts_atw_throw`, `darts_killer_throw`) parsing scored points, multipliers, activations, and lives.

## Proposed Changes

### 1. Generate `STATS_AUDIT_LOG.md`

* **What**: Create a new Markdown file in the project root.

* **Why**: Fulfills the user's request for unified metrics documentation to plan the offline-first database setup migration.

* **How**:
  Create the file with the following structure, populated by the exact formulas extracted from `src/lib/stats.ts`, `src/lib/supabase.ts`, and `supabase/migrations/20260701_final_analytics_view_fix.sql`:

  **Example Structure**:

  ```markdown
  # Web App Metrics & Tracking Audit Log

  ## Storage Mechanism Overview
  - **Local Storage**: Not used for stats (only `sk_user` and `sk_session_id`).
  - **Live State**: React Component State (`DartsRuntimeState`, etc.) & Context.
  - **Persistence**: Supabase Postgres (`match_events`, `player_career_stats`, `player_career_analytics`).

  ## Cricket
  * **Strike Rate**
    * Backend State Variable: `strike_rate`
    * Exact Live Calculation: `(total_runs / total_balls_faced) * 100`
    * Web Storage Mechanism: `player_career_analytics` (Supabase View) / React State
  ...
  ```

### 2. Output Confirmation

* **What**: Provide a short summary reply in the chat.

* **Why**: To confirm to the user that the audit log has been created and to summarize where the stats were actually hidden (Supabase/React State instead of localStorage).

## Verification Steps

* Check that `STATS_AUDIT_LOG.md` is successfully written to the project root.

* Verify that it contains sections for Cricket, Chip Off, and Darts, formatted exactly as requested.

* Confirm the storage mechanisms explicitly state that `localStorage` is not used for stats.

