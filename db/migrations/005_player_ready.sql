-- Add ready flag to players for lobby coordination

ALTER TABLE players ADD COLUMN IF NOT EXISTS ready BOOLEAN NOT NULL DEFAULT false;
