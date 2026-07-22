# Tasks
- [x] Task 1: Reconcile shared UI and setup assumptions against the live codebase.
  - [x] Verify the actual avatar stack and replace `PlayerAvatar` assumptions with the confirmed `UserAvatar` / `Avatar` split where appropriate.
  - [x] Verify whether shared UI primitives such as `InfoTooltip` and `TeamVsTeamLayout` exist, and mark them as missing build work where they do not.
  - [x] Map the current house-rules setup flow to its real implementation in `NewMatchPage.tsx`, including how rules are rendered and persisted.

- [x] Task 2: Reconcile schema and auth assumptions against the live backend model.
  - [x] Verify the live team storage model and replace `teams` assumptions with the confirmed `match_teams` table where appropriate.
  - [x] Verify whether a shared `comments` table exists, and if not, record comments/events features as requiring new schema and RLS work.
  - [x] Map auth-protected features to the live `x-session-id`, `active_sessions`, and database-helper flow used by the app.

- [x] Task 3: Reconcile runtime architecture assumptions for match rooms, spectator mode, and analytics.
  - [x] Verify how new sports and variants are wired through `NewMatchPage.tsx`, `MatchRoomPage.tsx`, and `SpectatorPage.tsx`.
  - [x] Identify which sport rooms are replayable/persisted versus local-state-only so future specs do not assume reconnect-safe live state where it does not exist.
  - [x] Verify how leaderboard and profile stats currently flow through `stats.ts`, `matches.ts`, and analytics views before new leaderboard specs build on them.

- [x] Task 4: Update the master build plan and affected child specs with code-backed terminology, integration notes, and blockers.
  - [x] Replace incorrect names and assumptions with confirmed live symbols and tables.
  - [x] Add explicit notes where a planned feature depends on missing shared infrastructure that must be built first.
  - [x] Preserve aspirational architecture only when clearly labeled as future-state rather than currently live.

- [x] Task 5: Validate the reconciled plan for completeness and internal consistency.
  - [x] Cross-check every corrected claim against a live code reference before marking the reconciliation complete.
  - [x] Confirm no updated plan/spec text still treats missing infrastructure as already shipped.
  - [x] Confirm implementation sequencing reflects actual blockers, especially for comments, shared tooltips/layouts, and non-persisted sport rooms.

# Task Dependencies
- Task 4 depends on Task 1.
- Task 4 depends on Task 2.
- Task 4 depends on Task 3.
- Task 5 depends on Task 4.
