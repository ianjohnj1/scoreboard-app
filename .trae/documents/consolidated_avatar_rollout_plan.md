# Plan: Consolidated Avatar Rollout For Dashboard, Match Rooms, and Spectator Rooms

## Summary
Fix the remaining dashboard avatar failures and extend the shared avatar logic into match rooms and spectator rooms so uploaded profile photos display anywhere a real player profile is being shown.

This plan consolidates three related avatar problems into one implementation pass:
- dashboard header and live activity still have two real-data gaps
- match room identity surfaces mostly still render initials
- spectator room identity surfaces mostly still render initials or no avatar at all

## Current State Analysis
- The shared profile-aware avatar path already exists through [UserAvatar.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/UserAvatar.tsx) and the low-level [Avatar.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/Avatar.tsx).
- Dashboard, profile, and leaderboard already use the shared path in the main surfaces, so they form the correct target pattern.
- The remaining dashboard mismatches are not a rendering problem:
  - `getLiveActivity()` still omits `avatar_url` from the joined profile select in [matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts).
  - `AuthContext` still hydrates `currentUser` from cached local storage and does not refresh the canonical profile row on initialization in [AuthContext.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/contexts/AuthContext.tsx).
  - `ProfilePage.tsx` updates the avatar in the database but does not currently push that update back into auth state, which can leave the dashboard header stale during the current session.
- Match and spectator flows are the bigger consistency gap:
  - `MatchRoomPage.tsx` still uses raw `Avatar` for player strips and roster/edit surfaces.
  - `CricketRoom.tsx`, `GolfRoom.tsx`, `ChipOffRoom.tsx`, `DartsRoom.tsx`, `CustomRoom.tsx`, and `CardsRoom.tsx` still use raw `Avatar` for real player profiles.
  - `SpectatorPage.tsx` itself has no participant avatar treatment in its page header.
  - Some sport rooms like table tennis, pool, and basketball are still text-only in their current scoreboards.
- The key architectural rule is now clear:
  - if the UI is rendering a real `Profile`, it should use `UserAvatar`
  - raw `Avatar` should be reserved for lower-level primitive use or non-profile entities only

## Proposed Changes

### 1. Fix remaining dashboard data issues

#### `src/lib/matches.ts`
- Update `getLiveActivity()` to include `avatar_url` in the joined `created_by_profile` select.
- Keep the returned object shape the same so the existing dashboard UI does not need structural changes.

#### `src/contexts/AuthContext.tsx`
- Refresh `currentUser` from the canonical `profiles` row during auth initialization whenever a cached user ID exists.
- Sanitize the refreshed profile before storing it back into state and local storage.
- Add a small profile sync helper to the auth API, such as `syncCurrentUser(profile)` or `refreshCurrentUser()`, so in-session profile edits can update dashboard/header identity immediately.

#### `src/pages/ProfilePage.tsx`
- After avatar upload succeeds, push the updated profile back into auth state using the new auth sync helper.
- Apply the same sync behavior after settings updates that change display-layer profile fields.

### 2. Standardize match room identity surfaces

#### `src/pages/MatchRoomPage.tsx`
- Replace raw `Avatar` usage with `UserAvatar` anywhere a real `Profile` is shown:
  - top player strip
  - roster modal/add player surfaces
  - any edit roster player list items
- Preserve existing layout and sizing; only change the avatar path and props.

### 3. Standardize sport room player avatars

#### `src/components/sports/CricketRoom.tsx`
- Replace raw `Avatar` usage with `UserAvatar` for batters, bowlers, player summaries, and any live/stat rows that already use profile objects.

#### `src/components/sports/GolfRoom.tsx`
- Replace raw `Avatar` usage with `UserAvatar` in:
  - summary strip
  - scorecard column headers
  - score sheet/player lists

#### `src/components/sports/ChipOffRoom.tsx`
- Replace raw `Avatar` usage with `UserAvatar` for current player displays and live leaderboard rows.

#### `src/components/sports/DartsRoom.tsx`
- Replace raw `Avatar` usage with `UserAvatar` for player panels and post-match/live stat rows.

#### `src/components/sports/CustomRoom.tsx`
- Replace raw `Avatar` usage with `UserAvatar` where player profiles are shown.

#### `src/components/sports/CardsRoom.tsx`
- Replace raw `Avatar` usage with `UserAvatar` in profile-driven score-entry rows and player displays.

### 4. Extend spectator and room headers

#### `src/pages/SpectatorPage.tsx`
- Add a compact participant avatar strip beneath or alongside the existing spectator header when player profiles are available.
- Use `UserAvatar` for those participants so spectator mode visually reflects the same player identity system used elsewhere.
- Keep the header lightweight and broadcast-friendly; do not overcrowd it.

#### Sport room spectator surfaces
- Where spectator views already show player rows or scorecard headers using profiles, convert those to `UserAvatar` rather than initials.
- Prefer piggybacking on existing room-level avatar replacements instead of building spectator-only special cases.

### 5. Optional text-only scoreboards audit

#### `src/components/sports/TableTennisRoom.tsx`
#### `src/components/sports/PoolRoom.tsx`
#### `src/components/sports/BasketballRoom.tsx`
- Audit these scoreboards and decide case-by-case whether there is enough space to add avatars without hurting readability.
- If the scoreboard is fundamentally team/text oriented, keep text-only presentation for now and do not force avatars into cramped layouts.
- This part is lower priority than converting existing raw-avatar profile surfaces.

## Assumptions & Decisions
- The shared avatar rule is:
  - real `Profile` object present -> use `UserAvatar`
  - no real profile object or purely team-based UI -> raw `Avatar` or text-only UI may remain
- Dashboard/profile/leaderboard are now the canonical pattern to follow.
- The next implementation should prioritize consistency and data correctness over visual redesign.
- The scope includes both fixing data flow for dashboard avatars and replacing initials-only profile surfaces in match/spectator contexts.
- Text-only scoreboards that were never designed with avatars do not have to be forced into avatar-heavy layouts during the same pass.

## Verification Steps
- Verify the logged-in dashboard header shows the user’s uploaded photo without requiring logout/login.
- Verify Live Activity host avatars now show uploaded photos when they exist.
- Verify player avatars display correctly in:
  - `MatchRoomPage`
  - cricket room
  - golf room
  - chip off room
  - darts room
  - custom room
  - cards room
- Verify spectator room headers and participant displays now show uploaded photos where profile data exists.
- Verify initials still appear correctly when a player genuinely has no uploaded image or the image fails to load.
- Verify no layout regressions on narrow mobile widths where avatars are added to room headers or score rows.
- Run diagnostics on all edited files and a production build after implementation.
