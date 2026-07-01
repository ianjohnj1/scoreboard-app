# fix-profile-stats-disconnect Spec

## Why
Users are reporting that player profiles show "No stats yet" even after completing matches that appear correctly on the leaderboard. This is due to a disconnect in the `player_career_analytics` view, which is the primary data source for the Profile Page. Specifically, there are conflicting migrations regarding the source of truth for Cricket (raw events vs. `cricket_player_stats` table) and a mismatch in how "Chip Off" matches are identified (labeled as 'golf' in the database but expected as 'chip_off' by the frontend).

## What Changes
- **Source of Truth Consolidation**: The `player_career_analytics` view will be updated to exclusively use the `cricket_player_stats` table for Cricket metrics.
- **Dynamic Sport Mapping**: The view will now dynamically map 'golf' matches with a 'chip_off' house rules variant to the 'chip_off' sport label.
- **Metric Normalization**: Ensure all calculated metrics (Strike Rate, Economy, Dot %, etc.) match the exact column names and expected behaviors in `ProfilePage.tsx`.
- **Match Status Alignment**: The view will continue to only include 'completed' matches to ensure data integrity.

## Impact
- Affected specs: `fix-leaderboard-data-sync` (complimentary), `practice-mode-and-analytics`.
- Affected code: `supabase/migrations/20260701_final_analytics_view_fix.sql` (new migration).
- Database: `player_career_analytics` (View).

## ADDED Requirements
### Requirement: View-Level Sport Mapping
The `player_career_analytics` view SHALL report the sport as 'chip_off' when the base sport is 'golf' AND the house rules specify the 'chip_off' variant.

#### Scenario: Chip Off Stats Display
- **WHEN** a user plays a Chip Off match (sport='golf', variant='chip_off')
- **THEN** the profile page receives records with `sport = 'chip_off'`, enabling the specialized Chip Off stats card.

## MODIFIED Requirements
### Requirement: Cricket Stats Source
The system SHALL use the `cricket_player_stats` table for all aggregate cricket metrics in the `player_career_analytics` view, rather than parsing raw `match_events`.

#### Scenario: Cricket Profile Stats
- **WHEN** a cricket match is completed and `cricket_player_stats` are populated
- **THEN** the profile page displays Strike Rate, Economy, and Dot Ball % derived from those records.
