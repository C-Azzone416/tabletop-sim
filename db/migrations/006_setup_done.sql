-- Track per-player setup completion
ALTER TABLE players ADD COLUMN IF NOT EXISTS setup_done BOOLEAN NOT NULL DEFAULT false;
