# Tasks
- [x] Task 1: Create and apply the final SQL migration for the analytics view
  - [x] SubTask 1.1: Create `supabase/migrations/20260701_final_analytics_view_fix.sql`
  - [x] SubTask 1.2: Implement the `player_career_analytics` view using `cricket_player_stats` and dynamic sport mapping
  - [x] SubTask 1.3: Apply the migration to the database
- [x] Task 2: Verify the Profile Page stats population
  - [x] SubTask 2.1: Open the application and navigate to a player profile with existing match data
  - [x] SubTask 2.2: Verify that "Competitive" stats are displayed for Cricket and Chip Off
  - [x] SubTask 2.3: Verify that "Practice" stats are displayed when toggled
- [x] Task 3: Audit `cricket_player_stats` for missing data points
  - [x] SubTask 3.1: Ensure `bowl_dots` and other new metrics are correctly calculated in the view

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
