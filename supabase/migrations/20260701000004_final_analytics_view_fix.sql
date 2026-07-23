-- Drop and recreate player_career_analytics view with final fixes
DROP VIEW IF EXISTS player_career_analytics;

CREATE VIEW player_career_analytics AS
WITH player_match_status AS (
    SELECT
        mp.profile_id,
        mr.id as match_id,
        -- Dynamic sport mapping for chip_off
        CASE 
            WHEN mr.sport = 'golf' AND (mr.house_rules->>'variant') = 'chip_off' THEN 'chip_off'
            ELSE mr.sport
        END as sport,
        mr.is_practice,
        CASE
            WHEN mr.winner_profile_id = mp.profile_id THEN 1
            WHEN mr.winner_team_id IS NOT NULL AND mr.winner_team_id = mp.team_id THEN 1
            ELSE 0
        END as is_win,
        CASE WHEN mr.created_by = mp.profile_id AND mr.winner_profile_id = mp.profile_id THEN 1 ELSE 0 END as is_architect_win
    FROM match_players mp
    JOIN match_rooms mr ON mp.match_id = mr.id
    WHERE mr.status = 'completed'
),
cricket_metrics AS (
    SELECT
        profile_id,
        match_id,
        SUM(bat_runs) as cricket_runs,
        SUM(bat_balls) as cricket_balls_faced,
        SUM(bat_dots) as cricket_dots_faced,
        SUM(bat_fours) as cricket_fours,
        SUM(bat_sixes) as cricket_sixes,
        SUM(bowl_balls) as cricket_balls_bowled,
        SUM(bowl_runs) as cricket_runs_conceded,
        SUM(bowl_wickets) as cricket_wickets_taken,
        SUM(bowl_dots) as cricket_dots_bowled
    FROM cricket_player_stats
    GROUP BY profile_id, match_id
),
chip_off_metrics AS (
    SELECT
        me.player_id as profile_id,
        me.match_id,
        SUM((me.event_data->>'points')::int) as chip_off_points,
        COUNT(CASE WHEN (me.event_data->>'points')::int = 10 THEN 1 END) as chip_off_aces,
        COUNT(*) as chip_off_total_chips,
        COUNT(CASE WHEN (me.event_data->>'points')::int IN (2, 5, 10) THEN 1 END) as chip_off_scoring_chips
    FROM match_events me
    WHERE me.is_undone = false AND me.event_type = 'chip_off_score'
    GROUP BY me.player_id, me.match_id
)
SELECT
    pms.profile_id,
    pms.sport,
    pms.is_practice,
    COUNT(*) as matches_played,
    SUM(pms.is_win) as matches_won,
    COUNT(*) - SUM(pms.is_win) as matches_lost,
    SUM(pms.is_architect_win) as course_architect_wins,
    -- Cricket Batting
    SUM(COALESCE(crm.cricket_runs, 0))::int as total_cricket_runs,
    SUM(COALESCE(crm.cricket_balls_faced, 0))::int as total_cricket_balls_faced,
    CASE WHEN SUM(COALESCE(crm.cricket_balls_faced, 0)) > 0 THEN (SUM(COALESCE(crm.cricket_runs, 0))::float / SUM(COALESCE(crm.cricket_balls_faced, 0))) * 100 ELSE 0 END as strike_rate,
    CASE WHEN SUM(COALESCE(crm.cricket_balls_faced, 0)) > 0 THEN (SUM(COALESCE(crm.cricket_dots_faced, 0))::float / SUM(COALESCE(crm.cricket_balls_faced, 0))) * 100 ELSE 0 END as dot_ball_percentage,
    CASE WHEN SUM(COALESCE(crm.cricket_runs, 0)) > 0 THEN ((SUM(COALESCE(crm.cricket_fours, 0)) * 4 + SUM(COALESCE(crm.cricket_sixes, 0)) * 6)::float / SUM(COALESCE(crm.cricket_runs, 0))) * 100 ELSE 0 END as boundary_percentage,
    -- Cricket Bowling
    SUM(COALESCE(crm.cricket_balls_bowled, 0))::int as total_cricket_balls_bowled,
    SUM(COALESCE(crm.cricket_runs_conceded, 0))::int as total_cricket_runs_conceded,
    SUM(COALESCE(crm.cricket_wickets_taken, 0))::int as total_cricket_wickets_taken,
    SUM(COALESCE(crm.cricket_dots_bowled, 0))::int as total_cricket_dots_bowled,
    CASE WHEN SUM(COALESCE(crm.cricket_balls_bowled, 0)) > 0 THEN (SUM(COALESCE(crm.cricket_runs_conceded, 0))::float / (SUM(COALESCE(crm.cricket_balls_bowled, 0))::float / 6)) ELSE 0 END as economy_rate,
    CASE WHEN SUM(COALESCE(crm.cricket_wickets_taken, 0)) > 0 THEN (SUM(COALESCE(crm.cricket_balls_bowled, 0))::float / SUM(COALESCE(crm.cricket_wickets_taken, 0))) ELSE 0 END as bowling_strike_rate,
    -- Chip Off
    SUM(COALESCE(chm.chip_off_points, 0))::int as total_chip_off_points,
    SUM(COALESCE(chm.chip_off_total_chips, 0))::int as total_chip_off_chips,
    CASE WHEN SUM(COALESCE(chm.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(chm.chip_off_points, 0))::float / (SUM(COALESCE(chm.chip_off_total_chips, 0)) * 10)) * 100 ELSE 0 END as scoring_efficiency,
    CASE WHEN SUM(COALESCE(chm.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(chm.chip_off_aces, 0))::float / SUM(COALESCE(chm.chip_off_total_chips, 0))) * 100 ELSE 0 END as ace_frequency,
    CASE WHEN SUM(COALESCE(chm.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(chm.chip_off_scoring_chips, 0))::float / SUM(COALESCE(chm.chip_off_total_chips, 0))) * 100 ELSE 0 END as hazard_avoidance_rating,
    CASE WHEN SUM(COALESCE(chm.chip_off_total_chips, 0)) > 0 THEN (SUM(COALESCE(chm.chip_off_points, 0))::float / SUM(COALESCE(chm.chip_off_total_chips, 0))) ELSE 0 END as average_proximity_tier
FROM player_match_status pms
LEFT JOIN cricket_metrics crm ON pms.profile_id = crm.profile_id AND pms.match_id = crm.match_id
LEFT JOIN chip_off_metrics chm ON pms.profile_id = chm.profile_id AND pms.match_id = chm.match_id
GROUP BY pms.profile_id, pms.sport, pms.is_practice;
