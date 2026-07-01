-- Phase 1: Add is_practice to match_rooms
ALTER TABLE match_rooms ADD COLUMN is_practice BOOLEAN DEFAULT false;

-- Phase 2: Create player_career_analytics view
-- This view aggregates match_events to provide broadcaster-level stats
CREATE OR REPLACE VIEW player_career_analytics AS
WITH event_metrics AS (
    SELECT
        me.player_id,
        mr.sport,
        mr.is_practice,
        -- Cricket Batting Metrics
        SUM(CASE WHEN me.event_type = 'delivery' THEN (me.event_data->>'runs')::int ELSE 0 END) as cricket_runs,
        COUNT(CASE WHEN me.event_type = 'delivery' AND (me.event_data->>'extra' IS NULL OR me.event_data->>'extra' IN ('bye', 'legbye')) THEN 1 END) as cricket_balls_faced,
        COUNT(CASE WHEN me.event_type = 'delivery' AND (me.event_data->>'runs')::int = 0 AND (me.event_data->>'extra' IS NULL OR me.event_data->>'extra' IN ('bye', 'legbye')) THEN 1 END) as cricket_dots_faced,
        COUNT(CASE WHEN me.event_type = 'delivery' AND (me.event_data->>'runs')::int = 4 THEN 1 END) as cricket_fours,
        COUNT(CASE WHEN me.event_type = 'delivery' AND (me.event_data->>'runs')::int = 6 THEN 1 END) as cricket_sixes,
        
        -- Cricket Bowling Metrics (Attributed to the bowler in event_data for wickets)
        -- Note: For simplicity, we attribute wickets to the dismissedBy field in event_data
        -- For runs conceded, we need to join differently or use a more complex query if we want full bowling figures
        -- Here we use a simplified version for the view
        
        -- Chip Off Metrics
        SUM(CASE WHEN me.event_type = 'chip_off_score' THEN (me.event_data->>'points')::int ELSE 0 END) as chip_off_points,
        COUNT(CASE WHEN me.event_type = 'chip_off_score' AND (me.event_data->>'points')::int = 10 THEN 1 END) as chip_off_aces,
        COUNT(CASE WHEN me.event_type = 'chip_off_score' THEN 1 END) as chip_off_total_chips,
        COUNT(CASE WHEN me.event_type = 'chip_off_score' AND (me.event_data->>'points')::int IN (2, 5, 10) THEN 1 END) as chip_off_scoring_chips
    FROM match_events me
    JOIN match_rooms mr ON me.match_id = mr.id
    WHERE me.is_undone = false
    GROUP BY me.player_id, mr.sport, mr.is_practice
)
SELECT
    player_id as profile_id,
    sport,
    is_practice,
    -- Cricket Batting
    cricket_runs,
    cricket_balls_faced,
    CASE WHEN cricket_balls_faced > 0 THEN (cricket_runs::float / cricket_balls_faced) * 100 ELSE 0 END as strike_rate,
    CASE WHEN cricket_balls_faced > 0 THEN (cricket_dots_faced::float / cricket_balls_faced) * 100 ELSE 0 END as dot_ball_percentage,
    CASE WHEN cricket_runs > 0 THEN ((cricket_fours * 4 + cricket_sixes * 6)::float / cricket_runs) * 100 ELSE 0 END as boundary_percentage,
    
    -- Chip Off
    chip_off_points,
    chip_off_total_chips,
    CASE WHEN chip_off_total_chips > 0 THEN (chip_off_points::float / (chip_off_total_chips * 10)) * 100 ELSE 0 END as scoring_efficiency,
    CASE WHEN chip_off_total_chips > 0 THEN (chip_off_aces::float / chip_off_total_chips) * 100 ELSE 0 END as ace_frequency,
    CASE WHEN chip_off_total_chips > 0 THEN (chip_off_scoring_chips::float / chip_off_total_chips) * 100 ELSE 0 END as hazard_avoidance_rating
FROM event_metrics;
