-- Mission 1 schema updates

-- Add join code for game lobbies (app must generate a random code, no default)
ALTER TABLE games ADD COLUMN join_code TEXT UNIQUE NOT NULL;
ALTER TABLE games ADD CONSTRAINT join_code_length CHECK (char_length(join_code) >= 4);

-- Track whose turn it is (set null if player is removed)
ALTER TABLE games ADD COLUMN current_turn_player_id UUID REFERENCES players(id) ON DELETE SET NULL;

-- Track double detector usage per player
ALTER TABLE players ADD COLUMN double_detector_used BOOLEAN NOT NULL DEFAULT FALSE;

-- Support double detector action (second target wire)
ALTER TABLE turns ADD COLUMN target_wire_id_2 UUID REFERENCES wires(id);
