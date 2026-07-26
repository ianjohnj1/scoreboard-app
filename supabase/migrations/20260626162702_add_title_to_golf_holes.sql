-- Add title column to golf_holes table
ALTER TABLE golf_holes ADD COLUMN IF NOT EXISTS title TEXT;
