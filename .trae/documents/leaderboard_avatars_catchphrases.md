# Plan: Enhance Leaderboard Player Cards with Avatars and Catchphrases

## Summary
The user wants to personalize the leaderboard by displaying actual user profile pictures in the avatar circles (instead of just their initials) and to display the user's "catchphrase" to highlight player customization and drive interactivity.

## Current State Analysis
1. **Avatar Component**: `src/components/Avatar.tsx` already supports displaying images via a `url` prop, but it is currently not being passed the `avatar_url` from the profile object in the leaderboard page.
2. **Profile Data**: The leaderboard data (via `getGlobalLeaderboardData`) already fetches the `profile` object, which correctly contains both `avatar_url` and `catchphrase` properties according to the `Profile` type in `src/lib/supabase.ts`.
3. **Leaderboard UI**: In `src/pages/LeaderboardPage.tsx`, the leaderboard lists players using `<Avatar name={...} color={...} size="sm" />`. Neither the podium (top 3) nor the main list passes the `url` prop or renders the catchphrase.

## Proposed Changes

### `src/pages/LeaderboardPage.tsx`
- **What**: Inject the `avatar_url` and `catchphrase` into the leaderboard's podium and list views.
- **How**:
  - **Podium (Top 3)**:
    - Update the `<Avatar>` components for 1st, 2nd, and 3rd place to include `url={entries[X].profile?.avatar_url}`.
    - Under the player's name (and above the points), add an italicized, neon-accented `<p>` tag to display `"{entries[X].profile?.catchphrase}"` if it exists. Make sure to truncate it so it doesn't break the podium layout.
  - **List View (All Ranks)**:
    - Update the `<Avatar>` component in the mapped list to include `url={entry.profile?.avatar_url}`.
    - Inside the `.flex-1.min-w-0` div under the player's name, add a conditional render block for `entry.profile?.catchphrase`. Render it in a small, italicized, neon-colored font (e.g., `text-accent-400 text-[10px] italic truncate`).

## Assumptions & Decisions
- **Decision**: The catchphrase will be rendered with `truncate` to ensure that excessively long phrases don't wrap and break the rigid leaderboard UI, especially on mobile devices.
- **Decision**: If a player has no `avatar_url`, the `Avatar` component will gracefully fall back to the existing initial + background color logic automatically.
- **Assumption**: The `profile` object returned in `LeaderboardEntry` reliably contains the latest `avatar_url` and `catchphrase` since it's joined directly from the `profiles` table.

## Verification Steps
1. Navigate to the Leaderboards page.
2. Verify that users with custom profile pictures now display their images instead of initials.
3. Verify that users with a custom catchphrase now display it under their name in both the top 3 podium and the lower list.
4. Ensure long catchphrases correctly truncate (`...`) and do not break the layout.