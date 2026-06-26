-- Add match_time column to match_rooms table
ALTER TABLE match_rooms ADD COLUMN IF NOT EXISTS match_time TIMESTAMPTZ DEFAULT now();
