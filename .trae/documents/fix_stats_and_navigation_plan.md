# Plan: Fix Stats Disconnect and Implement Leaderboard Profile Navigation

The goal is to resolve the discrepancy between the `cricket_player_stats` table and the application's stats displays (Leaderboard and Profile), and to enable navigating to any player's profile from the leaderboard.

## Current State Analysis
- **Stats Disconnect**: The `player_career_analytics` view and `getGlobalLeaderboardData` (used by the leaderboard) calculate metrics by aggregating raw `match_events`. However, `CricketRoom.tsx` maintains a more specialized `cricket_player_stats` table which handles complex logic (like backyard extras) that the event-based aggregation might miss.
- **Navigation**: The `/profile` route is currently static and only shows the logged-in user's profile. There is no route for viewing other users' stats, and no links from the leaderboard.

## Proposed Changes

### 1. Database Schema & View Updates
- **Update `cricket_player_stats`**: Add a `bowl_dots` column to track dot balls bowled more explicitly.
- **Update `player_career_analytics` View**: Refactor the view to join with `cricket_player_stats` for cricket-specific metrics instead of re-calculating them from `match_events`. This ensures the view reflects the "source of truth" mentioned by the user.

### 2. Application Logic Updates
- **`src/lib/stats.ts`**:
    - Update `getGlobalLeaderboardData` to fetch and use data from `cricket_player_stats` for cricket matches.
    - Update `aggregateMatchStats` to ensure `bowl_dots` is captured.
- **`src/components/sports/CricketRoom.tsx`**:
    - Update `handleDelivery` and `completeOverEarly` to increment `bowl_dots` in the `cricket_player_stats` table.

### 3. Routing & Navigation
- **`src/App.tsx`**: Add a new route `<Route path="/profile/:id" element={<ProfilePage />} />`.
- **`src/pages/ProfilePage.tsx`**:
    - Use `useParams()` to detect a `profileId`.
    - If `profileId` is present, fetch that specific user's profile and stats.
    - Conditionally hide the "Settings", "Logout", and "Admin Panel" buttons if the viewed profile is not the current user's.
- **`src/pages/LeaderboardPage.tsx`**:
    - Import `Link` from `react-router-dom`.
    - Wrap `Avatar` components and player names in `Link` pointing to `/profile/${entry.profile_id}`.

## Verification Steps
1. **Database**: Verify the view `player_career_analytics` returns data matching the `cricket_player_stats` table for cricket matches.
2. **Navigation**: Open the leaderboard, click a player's avatar, and verify it navigates to `/profile/[id]`.
3. **Profile**: Verify the profile page correctly displays the selected player's name, avatar, and career stats.
4. **Consistency**: Verify that a cricket match's runs and wickets on the profile match the values recorded in the database.
