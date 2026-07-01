# Implementation Plan - Phase 1 & 2

This plan covers the integration of **Practice Mode** and **Advanced Broadcaster Analytics** into the scoreboard application.

## Phase 1: Practice Mode Integration & Database Controls

### 1. Database Schema Update
- Add an `is_practice` (BOOLEAN, default false) column to the `match_rooms` table.
- This will allow us to segregate training data from competitive match data.

### 2. Match Initialization Flow
- **File**: [NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)
- **Change**: Add a "Practice Mode" toggle in the configuration step (`step === 'config'`).
- **Logic**: When enabled, the match record will be created with `is_practice: true`.
- **Player Selection**: Ensure the multi-player selection logic in Backyard/Solo modes works seamlessly for practice sessions.

### 3. Season Points (SP) & Leaderboard Exclusion
- **File**: [stats.ts](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/lib/stats.ts)
- **Functions**: 
    - `updateCareerStats`: Add a check to exit early if `match.is_practice` is true. This prevents practice matches from affecting lifetime wins, losses, or best scores in the `player_career_stats` table.
    - `getGlobalLeaderboardData`: Add `.eq('is_practice', false)` to the `match_rooms` query to ensure the global leaderboard remains strictly competitive.

### 4. Profile Page Filtering
- **File**: [ProfilePage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/ProfilePage.tsx)
- **Change**: Add a segment control (Competitive vs. Practice) to filter the career stats display.
- **Logic**: Update the query to filter `player_career_stats` or the new analytics view by the practice flag.

---

## Phase 2: Database View / Schema Updates for Broadcaster Stats

### 1. Advanced Analytics View (`player_career_analytics`)
- Create a Postgres view that aggregates raw `match_events` joined with `match_rooms`.
- **Metrics to include**:
    - **Cricket Batting**: Strike Rate, Dot Ball %, Boundary %.
    - **Cricket Bowling**: Economy Rate, Bowling Strike Rate, Dot Balls.
    - **Chip Off**: Scoring Efficiency, Ace Frequency, Hazard Avoidance Rating.
- **Guest Support**: Ensure aggregations correctly group by `profile_id`, preserving guest IDs.

### 2. Broadcaster Stats Implementation
- **Cricket Metrics**:
    - `strike_rate`: `(runs / balls_faced) * 100`
    - `dot_ball_percentage`: `(dots / total_balls) * 100`
    - `boundary_percentage`: `((fours * 4 + sixes * 6) / total_runs) * 100`
- **Chip Off Metrics**:
    - `scoring_efficiency`: `points / max_possible`
    - `ace_frequency`: `aces / total_chips`

### 3. Data Flow
- Update the Profile page and Leaderboard components to pull from this new analytics view when displaying advanced metrics.

## Verification Steps
- Create a practice match and verify no Season Points are awarded.
- Verify that practice match data appears only when the "Practice" filter is active on the Profile page.
- Check that Cricket and Chip Off advanced metrics calculate correctly based on match events.
