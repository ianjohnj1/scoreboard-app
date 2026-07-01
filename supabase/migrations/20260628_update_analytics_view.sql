-- Drop and recreate player_career_analytics view
DROP VIEW IF EXISTS player_career_analytics;

CREATE VIEW player_career_analytics AS
WITH player_match_status AS (
    SELECT
        mp.profile_id,
        mr.id as match_id,
        mr.sport,
        mr.is_practice,
        CASE
            WHEN mr.winner_profile_id = mp.profile_id THEN 1
            WHEN mr.winner_team_id IS NOT NULL AND mr.winner_team_id = mp.team_id THEN 1
            ELSE 0
        END as is_win
    FROM match_players mp
    JOIN match_rooms mr ON mp.match_id = mr.id
    WHERE mr.status = 'completed'
),
event_metrics AS (
    SELECT
        me.player_id,
        mr.id as match_id,
        SUM(CASE WHEN me.event_type = 'delivery' THEN (me.event_data->>'runs')::int ELSE 0 END) as cricket_runs,
        COUNT(CASE WHEN me.event_type = 'delivery' AND (me.event_data->>'extra' IS NULL OR me.event_data->>'extra' IN ('bye', 'legbye')) THEN 1 END) as cricket_balls_faced,
        COUNT(CASE WHEN me.event_type = 'delivery' AND (me.event_data->>'runs')::int = 0 AND (me.event_data->>'extra' IS NULL OR me.event_data->>'extra' IN ('bye', 'legbye')) THEN 1 END) as cricket_dots_faced,
        COUNT(CASE WHEN me.event_type = 'delivery' AND (me.event_data->>'runs')::int = 4 THEN 1 END) as cricket_fours,
        COUNT(CASE WHEN me.event_type = 'delivery' AND (me.event_data->>'runs')::int = 6 THEN 1 END) as cricket_sixes,
        SUM(CASE WHEN me.event_type = 'chip_off_score' THEN (me.event_data->>'points')::int ELSE 0 END) as chip_off_points,
        COUNT(CASE WHEN me.event_type = 'chip_off_score' AND (me.event_data->>'points')::int = 10 THEN 1 END) as chip_off_aces,
        COUNT(CASE WHEN me.event_type = 'chip_off_score' THEN 1 END) as chip_off_total_chips,
        COUNT(CASE WHEN me.event_type = 'chip_off_score' AND (me.event_data->>'points')::int IN (2, 5, 10) THEN 1 END) as chip_off_scoring_chips
    FROM match_events me
    JOIN match_rooms mr ON me.match_id = mr.id
    WHERE me.is_undone = false
    GROUP BY me.player_id, mr.id
)
SELECT
    pms.profile_id,
    pms.sport,
    pms.is_practice,
    COUNT(*) as matches_played,
    SUM(pms.is_win) as matches_won,
    COUNT(*) - SUM(pms.is_win) as matches_lost,
    SUM(COALESCE(em.cricket_runs, 0)) as total_cricket_runs,
    SUM(COALESCE(em.cricket_balls_faced, 0)) as total_cricket_balls_faced,
    CASE WHEN SUM(COALESCE(em.cricket_balls_faced, 0)) > 0 THEN (SUM(COALESCE(em.cricket_runs, 0))::float / SUM(COALESCE(em.cricket_balls_faced, 0))) * 100 ELSE 0 END as strike_rate,
    CASE WHEN SUM(COALESCE(em.cricket_balls_faced, 0)) > 0 THEN (SUM(COALESCE(em.cricket_dots_faced, 0))::float / SUM(COALESCE(em.cricket_balls_faced, 0))) * 100 ELSE 0 END as dot_ball_percentage,
    CASE WHEN SUM(COALESCE(em.cricket_runs, 0)) > 0 THEN ((SUM(COALESCE(em.cricket_fours, 0)) * 4 + SUM(COALESCE(em.cricket_sixes, 0)) * 6)::float / SUM(COALESCE(em.cricket_runs, 0))) * 100 ELSE 0 END as boundary_percentage,
    SUM(COALESCE(em.chip_off_points, 0)) as total_chip_off_points,
    SUM(COALESCE(em.chip_off_total_chips, 0)) as total_chip_off_chips,
    CASE WHEN SUM(COALESCE(em.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(em.chip_off_points, 0))::float / (SUM(COALESCE(em.chip_off_total_chips, 0)) * 10)) * 100 ELSE 0 END as scoring_efficiency,
    CASE WHEN SUM(COALESCE(em.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(em.chip_off_aces, 0))::float / SUM(COALESCE(em.chip_off_total_chips, 0))) * 100 ELSE 0 END as ace_frequency,
    CASE WHEN SUM(COALESCE(em.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(em.chip_off_scoring_chips, 0))::float / SUM(COALESCE(em.chip_off_total_chips, 0))) * 100 ELSE 0 END as hazard_avoidance_rating
FROM player_match_status pms
LEFT JOIN event_metrics em ON pms.profile_id = em.player_id AND pms.match_id = em.match_id
GROUP BY pms.profile_id, pms.sport, pms.is_practice;
