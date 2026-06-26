# Plan: Custom Game Names and Timestamps

This plan implements the ability for users to provide a custom name and a specific timestamp when creating any type of match. This helps identify games in history records more easily than room codes.

## Current State Analysis
- **Match Rooms Table**: Already has a `custom_game_name` column, but it's currently only populated when the "Custom Sport" is selected.
- **Timestamp**: Uses `created_at` (automatic) for history. There is no column for a user-provided "match time".
- **Match Creation UI**: `NewMatchPage.tsx` has a multi-step flow. The "Configuration" step is currently where sport-specific rules are set.
- **Display**: `HistoryPage.tsx` and `Dashboard.tsx` primarily show the sport label and the `created_at` date.

## Proposed Changes

### 1. Database Schema Update
- Add a `match_time` column to the `match_rooms` table to store the user-provided or default timestamp.
- **Action**: Create and apply a migration file `add_match_time_to_match_rooms.sql`.
  ```sql
  ALTER TABLE match_rooms ADD COLUMN match_time TIMESTAMPTZ DEFAULT now();
  ```

### 2. Frontend Type Definitions
- Update the `MatchRoom` type in [supabase.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/supabase.ts) to include `match_time`.

### 3. Business Logic Refinement
- Update `getSportLabel` in [matches.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/matches.ts) to prioritize `custom_game_name` for all sports, not just "custom".
- Update `getSportIcon` to handle potential edge cases if needed.

### 4. Match Creation UI (NewMatchPage.tsx)
- **State**: Add `customGameName` and `matchTime` states.
- **UI**: In the `config` step, add a "Game Details" section before sport-specific rules.
  - Text input for "Game Name" (e.g., "Boxing Day Test").
  - DateTime-local input for "Match Time" (defaults to current time).
- **Persistence**: Update `handleCreateMatch` to include these fields in the Supabase `insert` call.

### 5. History & Dashboard Display
- Update `MatchCard` in [Dashboard.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/Dashboard.tsx) and the match list in [HistoryPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/HistoryPage.tsx).
  - Use `match.match_time` for the date display.
  - Ensure the custom name is prominently displayed as the title.

## Verification Plan
1. **Database**: Verify the `match_time` column exists and defaults correctly.
2. **Creation**: Start a new Cricket match, enter "Test Game" and a date in the past.
3. **Verification**: 
   - Check the `match_rooms` record in Supabase to see if `custom_game_name` and `match_time` are correct.
   - Go to the Dashboard and History page to confirm "Test Game" and the custom date are displayed.
