-- Games
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, active, won, lost
  captain_id UUID,
  detonator_position INTEGER NOT NULL DEFAULT 0,
  detonator_max INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seat_order INTEGER NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wire tiles on each player's rack
CREATE TABLE wires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  value TEXT NOT NULL,         -- '1'-'12', 'YELLOW', 'RED'
  color TEXT NOT NULL,         -- 'blue', 'yellow', 'red'
  rack_position INTEGER NOT NULL, -- left to right order (ascending)
  status TEXT NOT NULL DEFAULT 'hidden' -- hidden, cut, revealed
);

-- Info tokens placed on wires after failed guesses
CREATE TABLE info_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  wire_id UUID NOT NULL REFERENCES wires(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Validation tokens on the board (all 4 of a value cut)
CREATE TABLE validation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  wire_value TEXT NOT NULL,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Turn log
CREATE TABLE turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,   -- duo_cut, solo_cut, reveal_reds
  target_wire_id UUID REFERENCES wires(id),
  guessed_value TEXT,
  result TEXT,                 -- success, fail, explosion
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on games
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
