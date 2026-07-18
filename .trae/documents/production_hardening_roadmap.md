# Plan: Post-Test Optimization & Production Hardening Roadmap

## Summary

This plan documents the successful 10-user field test in the project memory and outlines a structured roadmap for hardening the application for production. The roadmap focuses on optimizing the spectator view for smooth HDMI broadcasting, implementing strict safety rails for concurrent score editing, and preparing the live traffic infrastructure to scale from 10 to 100+ concurrent users.

## Current State Analysis

1. **Real-World Test Status**: The app successfully handled 10 concurrent active users with flawless multi-room match execution, accurate scoring edits, and perfect HDMI laptop spectator scaling.
2. **Spectator View**: `SpectatorPage.tsx` currently renders the full, heavy interactive components (e.g., `CricketRoom.tsx`, `DartsRoom.tsx`) and relies purely on an `isSpectator` boolean flag to hide buttons. This means the browser still processes touch events and React still manages heavy local state hooks.
3. **Score Edit Safety Rails**: In `src/lib/matches.ts`, the `recordEvent` function calculates `sequence_num` by querying the `count` of existing events before inserting a new one. This read-modify-write pattern is highly vulnerable to race conditions during concurrent rapid scoring.
4. **Live Traffic Infrastructure**: The Supabase client in `src/lib/supabase.ts` connects directly via REST and WebSockets with an `eventsPerSecond` limit of 20. While sufficient for 10 users, scaling to 100+ requires optimizing payload sizes, ensuring strict channel cleanup, and preparing the backend connection pool.

## Proposed Changes

### Phase 1: Project Memory Update

* **Target File**: `c:\Users\User\.trae\memory\projects\-c-Users-User-Desktop-scoreboard-app-project\project_memory.md`

* **Action**: Append a new entry under "Lessons Learned" or "Project Context" documenting the successful 10-user field test, confirming the stability of multi-room execution, scoring edits, and HDMI spectator scaling.

### Phase 2: Spectator View Optimization (Roadmap)

* **Target Files**: `SpectatorPage.tsx`, Sport Room Components.

* **Action Items**:

  * **Browser-Level Event Stripping**: Apply a global `pointer-events-none` CSS class to the root container within `SpectatorPage.tsx` to completely bypass browser hit-testing and touch event processing, saving CPU cycles.

  * **Component Decoupling**: Plan a refactor to extract pure read-only presentation components (e.g., `ScorecardGrid`) from the heavy interactive rooms. `SpectatorPage` should eventually render lightweight `*SpectatorView` components to eliminate React reconciliation overhead from unused scoring hooks.

### Phase 3: Score Edit Safety Rails (Roadmap)

* **Target Files**: `src/lib/matches.ts`, Supabase Database Migrations.

* **Action Items**:

  * **Atomic Sequence Generation**: Replace the client-side `count` query in `recordEvent` with a Supabase Postgres Trigger or RPC function. The database must atomically assign `sequence_num` during the `INSERT` transaction to prevent race conditions.

  * **Optimistic UI & Rollbacks**: Standardize the optimistic UI pattern across all sports. Instantly apply score changes locally, but maintain a queue/rollback state to gracefully revert if the database rejects the transaction due to version conflicts.

### Phase 4: Live Traffic Infrastructure (Roadmap)

* **Target Files**: `src/lib/supabase.ts`, Supabase Dashboard.

* **Action Items**:

  * **Payload Minimization**: Audit all `recordEvent` calls to ensure `event_data` JSON payloads only transmit delta updates rather than full state objects, reducing WebSocket frame size.

  * **Connection Lifecycle Audit**: Enforce strict cleanup of `supabase.channel` subscriptions on component unmounts across all rooms to prevent zombie connections.

  * **Backend Pooling Strategy**: Document the need to configure Supavisor (Supabase connection pooler) for the REST API to handle sudden spikes of 100+ users connecting to Cloudflare Pages stateless functions.

## Assumptions & Decisions

* **Decision**: The roadmap will be formalized in this document and acts as the backlog for upcoming refactoring sessions.

* **Assumption**: The Supabase backend can support custom Postgres functions/triggers for the atomic sequence generation.

* **Assumption**: Spectator mode requires absolutely zero interaction, meaning `pointer-events-none` is a safe, blanket optimization.

## Verification Steps

1. Verify `project_memory.md` contains the new 10-user field test documentation.
2. Review this generated roadmap with the user to confirm the prioritization of the hardening tasks before beginning step-by-step implementation.

