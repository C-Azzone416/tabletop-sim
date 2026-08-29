-- #339 — spades_games, the spades_games half of #285's schema work.
-- Adopts PR #282's DDL verbatim (renumbered from his colliding 011,
-- which is mission_outcomes on develop) so he can drop his own
-- migration file instead of renumbering/rebasing it.
-- Migration only: packages/server/src/db/spades-games.ts accessors
-- stay PR #282's to land.
CREATE TABLE IF NOT EXISTS spades_games (
  game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spades_games_updated_at
  ON spades_games(updated_at);
