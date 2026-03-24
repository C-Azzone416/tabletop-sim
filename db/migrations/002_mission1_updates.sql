-- Mission 1 schema updates

-- Add join code for game lobbies
ALTER TABLE games ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE NOT NULL DEFAULT '';

-- Track whose turn it is
ALTER TABLE games ADD COLUMN IF NOT EXISTS current_turn_player_id UUID REFERENCES players(id);

-- Track double detector usage per player
ALTER TABLE players ADD COLUMN IF NOT EXISTS double_detector_used BOOLEAN NOT NULL DEFAULT FALSE;

-- Support double detector action (second target wire)
ALTER TABLE turns ADD COLUMN IF NOT EXISTS target_wire_id_2 UUID REFERENCES wires(id);
