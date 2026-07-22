# Plan: Apply PvP Migration (lineup_order) And Reload Schema Cache

## Summary

Fix the current PvP setup/runtime blocker:

- UI error: `Could not find the 'lineup_order' column of 'match_players' in the schema cache`

by applying the existing PvP migration to the linked Supabase project and forcing a PostgREST schema reload so inserts/updates to `match_players.lineup_order` succeed.

## Current State Analysis (Grounded)

- The frontend now writes `match_players.lineup_order` during PvP match creation in [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx).
- The repo already contains the migration that adds the column and updates the analytics view:
  - [20260722_putt_vs_putt_support.sql](file:///c:/Users/User/Desktop/scoreboard%20app/project/supabase/migrations/20260722_putt_vs_putt_support.sql)
  - `ALTER TABLE match_players ADD COLUMN IF NOT EXISTS lineup_order INTEGER;`
  - Drops/recreates `player_career_analytics` to add `putt_vs_putt` support.
- Your project is linked to a remote Supabase project via `supabase/.temp/linked-project.json` (ref `henoedqzusmnxtxdsyuc`).
- The error shown in the UI is consistent with the migration not yet being applied to the active database and/or PostgREST schema cache not yet reloaded.

## Proposed Changes

### 1) Create a tool-friendly migration copy (no timestamp name)

The connected migration tool’s descriptor recommends avoiding timestamps in migration filenames. To reduce tool friction, create a second migration file that is content-identical to the existing one:

- New file: `supabase/migrations/putt_vs_putt_support.sql`
- Contents: copy the full SQL from `20260722_putt_vs_putt_support.sql` as-is.
- Keep the original timestamped migration in place for repo history; the new file exists purely as an “apply target” for the tool.

### 2) Apply the migration to the linked Supabase project

Use the connected Supabase tools in this order:

1. `supabase_get_project` to confirm the repo is connected to a remote Supabase project.
2. `supabase_apply_migration` with `file_path` pointing at:
   - `supabase/migrations/putt_vs_putt_support.sql`

Expected DB changes:

- `match_players.lineup_order` column exists
- `player_career_analytics` view exists and includes `putt_vs_putt` rows/columns

### 3) Force schema cache refresh (PostgREST)

If the UI still shows the schema cache error after the migration:

- Run a PostgREST reload via SQL:
  - `select pg_notify('pgrst', 'reload schema');`

Alternative (manual): Supabase Dashboard → API settings → reload schema cache (naming varies in the UI).

### 4) Verify end-to-end in the UI

- In the running app:
  - Create a new Golf → PvP (Putt vs Putt) match
  - Ensure “Start Match” succeeds (no `lineup_order` error)
  - Record a few PvP events (Holed/Missed) and confirm they persist/realtime-update
- Verify analytics surfaces:
  - Profile page shows `putt_vs_putt` section without crashing
  - Golf leaderboard shows the additive PvP “Career Holes” column (even if 0)

## Assumptions & Decisions

- Decision: Apply the migration via the connected tool (your selection).
- Assumption: The active environment is using the linked remote Supabase project (not a separate local Supabase instance).
- Decision: Prefer a schema reload only if the PostgREST cache does not refresh automatically after migration.

## Verification Steps (Checklist)

1. Confirm migration applied successfully (tool output success).
2. Confirm `match_players` has `lineup_order`:
   - insert/update that sets `lineup_order` succeeds
3. Confirm PvP match creation succeeds from `NewMatchPage`.
4. Confirm PvP match room loads and events persist.
5. Confirm no dashboard-wide auth/header regressions (dashboard loads normally).

