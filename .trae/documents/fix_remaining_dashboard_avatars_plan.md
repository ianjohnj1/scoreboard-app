# Plan: Fix Remaining Dashboard Avatar Mismatches

## Summary
Fix the two remaining dashboard avatar mismatches so uploaded profile photos display consistently for:
- the logged-in user in the dashboard header
- hosts shown in the dashboard Live Activity section

The rendering layer is already mostly correct because `Dashboard.tsx` now uses the shared `UserAvatar` component. The remaining failures come from stale or incomplete data being passed into that component.

## Current State Analysis
- The dashboard header already renders through `UserAvatar` in [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx), passing `currentUser?.avatar_url`.
- The Live Activity cards also already render through `UserAvatar` in [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx), passing `profile.avatar_url`.
- The problem is upstream:
  - `getLiveActivity()` only selects `display_name, avatar_color` from the joined profile record and omits `avatar_url` in [matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts).
  - `AuthContext` hydrates `currentUser` from cached `localStorage` in [AuthContext.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/contexts/AuthContext.tsx) and does not refresh the full profile row from Supabase on init.
  - avatar upload in [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx) updates the `profiles` table but does not propagate that new `avatar_url` back into auth state or cached local storage.
- This explains the two exact user-facing failures:
  - `HARHE` in Live Activity falls back to initials because `avatar_url` is never returned by `getLiveActivity()`.
  - `EDAWWG` in the dashboard header can fall back to initials because `currentUser` may still be an older cached profile object without the latest `avatar_url`.

## Proposed Changes

### `src/lib/matches.ts`
- Update `getLiveActivity()` to include `avatar_url` in the `created_by_profile` joined select.
- Keep the existing return shape unchanged so `Dashboard.tsx` continues to consume `profile.avatar_url` without UI-layer rewrites.
- This directly fixes the Live Activity avatar case for players like `HARHE`.

### `src/contexts/AuthContext.tsx`
- Strengthen auth hydration so `currentUser` is refreshed from the canonical `profiles` table instead of trusting only the cached `sk_user` object from local storage.
- On initialization:
  - read the cached user only as a bootstrap reference
  - if an `id` exists, fetch the latest profile row from Supabase
  - sanitize it as needed
  - store the refreshed version back into state and local storage
- This ensures the dashboard header gets the latest `avatar_url`, display name, catchphrase, and any future profile fields without requiring the user to log out and back in.

### `src/contexts/AuthContext.tsx` API surface
- Add a small profile-sync helper to the auth context, such as `refreshCurrentUser()` or `updateCurrentUser(profile)`, so profile edits can push canonical profile changes into auth state immediately.
- Keep this scoped to profile synchronization only; do not redesign login/logout flow.

### `src/pages/ProfilePage.tsx`
- After successful avatar upload, fetch or construct the updated profile payload and push it into auth through the new auth sync helper.
- Apply the same sync pattern after profile settings updates if that flow also changes fields displayed in dashboard/header contexts.
- This avoids stale dashboard/profile identity data after in-session edits.

### `src/pages/Dashboard.tsx`
- No structural UI changes are required if the data fixes above are applied.
- Only make changes here if a small defensive fallback or reload hook is needed after the data fixes are in place.

## Assumptions & Decisions
- The shared avatar component and base avatar fallback logic are already correct enough for this issue; the remaining problem is data completeness and auth freshness.
- The intended rule is that any profile-driven avatar on the dashboard must always be sourced from canonical profile data, not stale cached snapshots.
- Refreshing auth state from the `profiles` table is preferable to telling users to re-login whenever they change an avatar.
- The scope of this fix is the two confirmed dashboard failures, not a new redesign of dashboard cards or match rows.

## Verification Steps
- Upload or verify an avatar for the logged-in user and confirm the dashboard header now shows the real photo without requiring logout/login.
- Verify a player like `HARHE` appears with their real uploaded photo in the Live Activity card instead of an initial fallback.
- Confirm `UserAvatar` still falls back to initials correctly when a user genuinely has no profile photo.
- Verify refreshed auth state does not reintroduce sensitive fields into local storage.
- Run diagnostics on:
  - [matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts)
  - [AuthContext.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/contexts/AuthContext.tsx)
  - [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx)
  - [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx)
- Run a production build to confirm the dashboard avatar data flow compiles cleanly.
