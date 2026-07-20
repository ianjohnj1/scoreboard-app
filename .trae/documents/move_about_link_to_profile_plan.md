# Plan: Move About Link From Dashboard To Profile

## Summary
Make the recently added About entry less prominent by removing it from the dashboard and relocating it to the player’s own profile page. Keep the standalone About page and `/about` route intact, but update the navigation flow so the About page feels like a profile/settings destination rather than a dashboard feature.

## Current State Analysis
- The current About entry is a full-width dashboard card in [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx#L156-L172), placed directly beneath the primary “Start New Match” CTA. That makes it visually louder than the user wants.
- The About page already exists as a protected route in [App.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/App.tsx#L128-L135), so no route redesign is required.
- The About page still assumes the dashboard is its primary parent because its back link points to `/` in [AboutPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/AboutPage.tsx#L35-L41).
- The own-profile page already contains personal and settings-oriented controls in [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx#L274-L289), followed by the main content area in [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx#L318-L523). This is a better information architecture fit for an About destination.

## Proposed Changes

### `src/pages/Dashboard.tsx`
- Remove the dedicated `About The App` card currently rendered under the start-match CTA.
- Remove any now-unused About-related imports introduced for that card, specifically the extra icon import if it becomes unused.
- Keep the dashboard focused on match activity, live play, and immediate actions.

### `src/pages/ProfilePage.tsx`
- Add a new own-profile-only `About The App` entry inside the main profile content area.
- Place it in a settings/help-style position rather than mixing it into stat cards. The best placement is just before the Admin Panel block in [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx#L474-L521), so it appears as a general profile destination for all users while remaining above admin-only controls.
- Reuse the existing card-style interaction pattern from the dashboard version, but tune it to feel more discreet:
  - full-width card is still acceptable,
  - softer supporting text,
  - standard right-chevron affordance,
  - only shown for `isOwnProfile`.
- Use a `Link` to `/about` so the behavior remains consistent with the existing route.

### `src/pages/AboutPage.tsx`
- Update the back link so it no longer says `Back to Dashboard`.
- Point it to `/profile`, or otherwise label it as returning to the profile page, so the navigation matches the new entry point.
- Keep the About page content unchanged unless a tiny wording adjustment is needed to align with the new navigation source.

## Assumptions & Decisions
- The goal is to relocate the About entry, not redesign the About page content.
- The About page should remain a standalone route instead of being embedded inside the profile page.
- The About link should only appear on the user’s own profile, not when viewing another player’s profile.
- “More discreet” means removing it from the dashboard’s primary action area and placing it in the profile/settings context, not hiding it completely.

## Verification Steps
- Verify the dashboard no longer shows the `About The App` card.
- Verify the user’s own profile page now includes a visible but subtler `About The App` link card.
- Verify other players’ profile pages do not show this About link.
- Verify tapping the profile About entry opens `/about`.
- Verify the About page back link now returns to the profile flow rather than the dashboard.
- Run diagnostics/build checks on the edited files to confirm no unused imports or route issues remain.
