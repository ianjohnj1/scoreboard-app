# App-Wide Security Audit Plan And Live Status

## Summary

This document began as a remediation plan and now doubles as the verified live-security baseline. The critical hardening work from the original audit is shipped, so future planning should use the implementation state below instead of the older pre-fix assumptions.

## Verified Live State

1. **Session-aware RLS is live:** `src/lib/supabase.ts` injects `x-session-id`, and `supabase/migrations/20260722_security_audit_rls.sql` defines `get_current_session_profile_id()` plus `is_match_participant()` to secure `active_sessions`, `match_rooms`, `match_players`, `match_teams`, `match_events`, `cricket_innings`, `cricket_player_stats`, `golf_scores`, and profile updates.
2. **`service_role` remains absent from the client:** the frontend uses the anon key only.
3. **Spectator room codes are no longer short `Math.random()` tokens:** `src/pages/NewMatchPage.tsx` now generates the room code from a UUID segment.
4. **Logout is session-owner scoped:** `src/contexts/AuthContext.tsx` deletes the current row from `active_sessions`, and the live RLS policy only allows deleting the active session identified by `x-session-id`.
5. **User-generated text is hardened in more than one layer:** React output escaping is still in place, and the audit follow-up introduced database-level text validation for profile fields.
6. **Server-side rate limiting exists:** the security audit shipped a Postgres rate limit on `match_events`, so the frontend `eventsPerSecond` setting is no longer the only control.
7. **Avatar upload rules are hardened:** storage is restricted by owner-path rules and a 5 MB limit.
8. **Predictable guest naming is no longer the baseline for new planning:** `NewMatchPage.tsx` creates guest usernames from a UUID segment instead of `guest_${Date.now()}`.

## Security Architecture

### Auth Model
- The app still uses custom PIN-based auth rather than Supabase Auth JWT sessions.
- `AuthContext.tsx` is the authoritative frontend session manager for profile refresh, `active_sessions` creation, session heartbeat, and logout cleanup.
- `active_sessions` is the bridge between the custom login flow and database policy enforcement.

### Request Context And RLS
- `src/lib/supabase.ts` attaches `x-session-id` to every request when `sk_session_id` exists in `localStorage`.
- `get_current_session_profile_id()` resolves that session header to the authenticated `profile_id`.
- `is_match_participant()` is the shared policy helper for match-scoped writes.

### Match And Spectator Security
- Match creation and room participation now rely on session-aware policies instead of open `USING (true)` rules.
- Room sharing should continue to use UUID-derived codes rather than shorter enumerable identifiers.
- Future spectator features such as comments or cheers still need new schema, RLS, and moderation rules because no shared comments table exists today.

## Remaining Follow-Ups

### Ongoing Hygiene
- Run dependency audits regularly and review git history for secret leakage.
- Keep Supabase CORS restricted to real deployment origins.
- Re-check storage policies whenever avatar handling changes.

### Future Security Work
- Guest-to-account migration still needs a dedicated secure flow if that feature returns to the roadmap.
- Admin-only moderation and deletion workflows should continue to be enforced server-side rather than relying on hidden UI affordances.
- New tables for comments, events scheduling, or social reactions must ship with RLS and abuse controls from day one.

## Verification Steps

1. Attempt to update protected match data with an invalid or missing `x-session-id` and verify the request fails.
2. Create a match and verify the stored `room_code` is UUID-derived rather than a short predictable token.
3. Log out and verify only the active `active_sessions` row is deleted.
4. Attempt burst event inserts and verify the server-side rate limit blocks abuse.
5. Upload an avatar above 5 MB or outside the profile-owned path and verify the upload is rejected.
