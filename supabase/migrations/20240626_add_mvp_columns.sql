-- Add new columns to player_career_stats for the Global MVP and Lifetime Aggregates
ALTER TABLE player_career_stats 
ADD COLUMN IF NOT EXISTS season_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cricket_lifetime_runs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cricket_lifetime_wickets INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS golf_lifetime_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS golf_lifetime_hio INTEGER DEFAULT 0;

-- Optional: Initialize existing records if they have data in extra_stats
UPDATE player_career_stats
SET 
  cricket_lifetime_runs = (extra_stats->>'runs')::INTEGER,
  cricket_lifetime_wickets = (extra_stats->>'wickets')::INTEGER
WHERE sport = 'cricket' AND extra_stats ? 'runs';

UPDATE player_career_stats
SET 
  golf_lifetime_points = (extra_stats->>'points')::INTEGER,
  golf_lifetime_hio = (extra_stats->>'hio')::INTEGER
WHERE sport = 'golf' AND extra_stats ? 'points';
