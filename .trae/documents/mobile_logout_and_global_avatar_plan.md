# Plan: Mobile Profile Header Fix + Global Avatar Consolidation

## Summary
Fix two related UI consistency issues:
- Ensure the logout control in the profile header is always reachable on mobile without any horizontal scroll.
- Consolidate avatar rendering behind a shared profile-aware component so uploaded profile photos consistently appear across the app, starting with the dashboard header and other profile-driven surfaces.

## Current State Analysis
- The profile page header currently places the large avatar, name, admin badge, username, win summary, theme toggle, settings gear, and logout button into a single top header arrangement in [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx#L247-L305).
- On narrow mobile widths, the left identity block and right action block compete for the same horizontal space. Because the action cluster is a single inline row, the logout button can be pushed off-screen or require sideways scrolling.
- The dashboard header currently renders the current user avatar without passing `avatar_url` in [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx#L101-L113), so it falls back to initials even when the user has uploaded a profile picture.
- The low-level avatar primitive already supports a `url` prop in [Avatar.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/Avatar.tsx#L4-L37), but avatar usage is still inconsistent because some screens map the profile fields correctly and others do not.
- Leaderboard and some profile surfaces already pass `avatar_url`, while dashboard and some profile subviews do not. That means the bug is architectural, not just a one-line omission.

## Proposed Changes

### `src/pages/ProfilePage.tsx`
- Refactor the own-profile header layout so it adapts to mobile instead of forcing all content into a single crowded horizontal row.
- Change the outer header container to a responsive stacked layout on small screens:
  - mobile: identity block first, action row second
  - larger screens: preserve the current side-by-side layout
- Keep the current visual hierarchy for avatar, name, admin badge, username, and win summary.
- Move the action controls into a dedicated responsive action row for `isOwnProfile`:
  - `ThemeToggle`
  - settings button
  - logout button
- Make the mobile logout control clearly tappable and always visible:
  - use a labeled button treatment on mobile widths instead of relying on icon-only controls
  - allow a more compact icon-style presentation again on larger screens if desired
- Preserve the compare button behavior for non-own profiles.

### `src/components/PlayerAvatar.tsx` or `src/components/UserAvatar.tsx`
- Add a new higher-level shared avatar component on top of [Avatar.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/Avatar.tsx).
- The new shared component should accept profile-oriented data instead of forcing each caller to wire the fields manually:
  - `display_name`
  - `avatar_color`
  - `avatar_url`
  - optional `size`
  - optional `className`
- The wrapper should always pass `avatar_url` through to the primitive, with a graceful fallback to initials if the image is missing or fails to load.
- Keep [Avatar.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/Avatar.tsx) as the visual primitive rather than deleting or renaming it.

### `src/components/Avatar.tsx`
- If needed, add lightweight image error fallback support so broken avatar URLs revert to initials cleanly instead of leaving a broken image state.
- Do not redesign its base styles beyond what is necessary for reliable fallback behavior.

### `src/pages/Dashboard.tsx`
- Replace the current direct avatar usage in the header with the new shared profile-aware avatar component, or at minimum route it through a single standardized avatar mapping path.
- Ensure the dashboard header uses the current user’s uploaded `avatar_url` instead of only initials and color.
- Audit the dashboard’s other user/profile avatar instances at the same time and migrate them to the shared component if they represent real player identities.

### `src/pages/ProfilePage.tsx` avatar call sites
- Replace existing ad hoc avatar usages with the shared component where the data source is a real profile object.
- Specifically normalize:
  - profile header avatar
  - settings modal avatar
  - guest/admin link rows where a real profile is being shown
  - compare modal avatars
- Ensure avatar behavior is consistent whether the user is viewing their own profile or another user’s profile.

### `src/pages/LeaderboardPage.tsx`
- Review existing leaderboard avatar usage and migrate it to the new shared avatar wrapper if practical.
- Preserve the current working behavior that already displays uploaded profile photos correctly.
- This keeps the new “global avatar rule” enforced through one shared interface instead of leaving the leaderboard as a special case.

## Assumptions & Decisions
- The core mobile fix is that logout must always be visible and tappable without horizontal scrolling, regardless of whether the final layout wraps or stacks.
- The preferred implementation is a structural responsive layout change, not just shrinking icons and spacing.
- The avatar consolidation should be incremental and targeted to profile-driven surfaces first, not a speculative app-wide sweep of every possible avatar usage.
- The new shared avatar component should sit above the existing primitive rather than replacing it outright.
- Catchphrases are part of the broader “player identity” direction, but this task only requires enforcing a shared avatar rule and fixing the dashboard/profile inconsistencies that are already visible.

## Verification Steps
- Verify the profile header on a narrow mobile viewport shows the logout control fully onscreen with no horizontal scroll required.
- Verify the own-profile header actions remain usable and visually clear on both mobile and desktop widths.
- Verify the compare button still behaves correctly on non-own profile views.
- Verify the dashboard header displays the uploaded profile photo when `avatar_url` exists.
- Verify avatar fallbacks still show initials when no photo exists or when the image fails to load.
- Verify the compare modal and any edited profile subviews now display uploaded photos consistently.
- Run diagnostics on the edited files and a production build to confirm no unused imports or component contract issues remain.
