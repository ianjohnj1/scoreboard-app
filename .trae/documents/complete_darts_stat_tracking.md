# Plan: Complete Darts Sub-Game Stat Tracking and Dashboard Metrics

## Summary
The requested Darts metrics update has already been fully executed in the previous session. The code, types, and SQL migrations are all present and correct. No further code edits are required. The only remaining action is for the user to manually apply the generated SQL migration to the Supabase database.

## Current State Analysis
1. **Darts SQL Aggregate View:** The migration file `supabase/migrations/20260711_darts_analytics_view.sql` was successfully created. It contains the CTEs (`darts_countdown_metrics`, `darts_atw_metrics`, `darts_killer_metrics`) required to compute `countdown_ppr`, `first_nine_ppr`, `checkout_pct`, `atw_efficiency`, `killer_lethality`, and `killer_survival`.
2. **Dashboard Component Layout:** `src/pages/ProfilePage.tsx` was already expanded. The Darts card component now includes the two requested rows of advanced metric cards (Row 1: Standard Darts, Row 2: Sub-Game Stats) directly beneath the basic stats.
3. **Zero/Null Handling:** The UI components in `ProfilePage.tsx` already include ternary fallbacks (e.g., `s.countdown_ppr > 0 ? s.countdown_ppr.toFixed(1) : '-'`) to safely handle missing data without crashing the layout.
4. **Types:** `src/lib/supabase.ts` was updated with the 6 new fields in the `PlayerCareerAnalytics` interface.

## Proposed Changes
- **None.** The codebase is already in the exact state requested by the user.

## Assumptions & Decisions
- The previous session successfully saved all file modifications to the disk.
- The `supabase_apply_migration` MCP tool failed previously due to missing access tokens, so the migration exists locally but hasn't been applied to the remote/active Supabase instance yet.

## Verification / Next Steps
1. **Apply Migration:** You must manually run `supabase db push` in your terminal to apply the `20260711_darts_analytics_view.sql` migration to your database.
2. **UI Check:** Once the database is updated, open the application, navigate to the User Dashboard (Profile Page), and confirm the new Darts metric cards display correctly.
