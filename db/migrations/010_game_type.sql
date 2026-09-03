-- Allow multiple game implementations to share rooms and join codes.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'wire-game';

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_game_type_check;

ALTER TABLE games
  ADD CONSTRAINT games_game_type_check
  CHECK (game_type IN ('wire-game', 'spades'));

CREATE INDEX IF NOT EXISTS idx_games_game_type ON games(game_type);
