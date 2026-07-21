-- Multi-color mission support (Missions 2-8)

-- Add wire_color to validation tokens so validations are tracked per color+value pair.
-- In Mission 1 (all blue), this defaults to 'blue' with no behavior change.
ALTER TABLE validation_tokens ADD COLUMN IF NOT EXISTS wire_color TEXT NOT NULL DEFAULT 'blue';
