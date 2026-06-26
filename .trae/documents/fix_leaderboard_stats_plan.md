# Plan: Resolve Leaderboard Disconnect and Fix Golf Stats

The user reported that Golf scores are being logged to the database but the Leaderboard (Leaders tab) remains empty or disconnected. This plan addresses the root causes, including RLS policy restrictions, bugs in the stats aggregation logic, and missing winner calculation triggers.

## Current State Analysis
- **Stats Aggregation**: [stats.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/stats.ts) calculates career stats but has a bug where 0-stroke games (empty scorecards) are treated as valid "best scores" for Golf.
- **Winner Tracking**: Match winners are not automatically calculated or recorded for Golf/Chip Off, leading to 0 wins in career stats.
- **RLS Policies**: Migrations like [update_career_stats_rls.sql](file:///c:/Users/User/Desktop/scoreboard%20app/project/supabase/migrations/update_career_stats_rls.sql) only allow `anon` users. Logged-in users (`authenticated`) might be blocked from updating stats.
- **Sport Naming**: Chip Off variants are saved as `chip_off` in career stats, which is correct, but might cause confusion if users expect them under `golf`.

## Proposed Changes

### 1. Robust Stats Aggregation & Winner Logic
Modify [stats.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/stats.ts):
- **Golf Classic**: Calculate the winner based on the lowest non-zero score if `winner_profile_id` is missing.
- **Chip Off**: Calculate the winner based on total points, with 10-pointers as a tie-breaker.
- **Best Score Bug**: In `updateCareerStats`, only update `best_score` for Golf if `stat.score > 0`.
- **Participation Check**: Only generate stats for players who actually have recorded scores or events to avoid polluting career stats with 0-score entries.

### 2. Update RLS Policies
Create a new migration (or update existing ones) to allow `authenticated` users:
- [update_career_stats_rls.sql](file:///c:/Users/User/Desktop/scoreboard%20app/project/supabase/migrations/update_career_stats_rls.sql)
- [fix_golf_rls.sql](file:///c:/Users/User/Desktop/scoreboard%20app/project/supabase/migrations/fix_golf_rls.sql)
- [fix_match_events_rls.sql](file:///c:/Users/User/Desktop/scoreboard%20app/project/supabase/migrations/fix_match_events_rls.sql)
- Change `TO anon` to `TO anon, authenticated`.

### 3. Automatic Winner Recording
Update [matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts):
- In `updateMatchStatus`, if the status is 'completed', determine the winner and update the `match_rooms` record BEFORE calling `updateCareerStats`. This ensures wins are correctly counted.

### 4. Leaderboard UI Improvements
Modify [LeaderboardPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/LeaderboardPage.tsx):
- Ensure sorting logic handles `null` or `0` best scores correctly for Golf.
- Verify that 'All Sports' view correctly aggregates different sport entries.

## Verification Plan
1. **Manual Test**: Start a Golf match, record scores for some holes, and end the match.
2. **Database Check**: Verify `player_career_stats` has a new or updated entry for the player with correct `best_score` and `matches_won`.
3. **UI Check**: Verify the entry appears on the "Leaders" tab under the correct sport filter.
4. **Chip Off Test**: Verify Chip Off winner calculation (points + tie-breaker) works as expected.
