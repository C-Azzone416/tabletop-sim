-- #361 — Flip (epic #358): game state and per-round scores.
-- Precedent: 015_spades_games.sql.
--
-- Two parts:
--   1. Widen the #324 game_type CHECK to admit 'flip'. The registry in
--      packages/shared/src/game-registry.ts is the primary create_game gate;
--      this constraint is the DB-level backstop, so it has to learn the new
--      id or no Flip room could ever be inserted once the game goes
--      available. DROP ... IF EXISTS then re-ADD is the only way to widen an
--      existing CHECK in Postgres.
--   2. flip_games / flip_round_scores.
--
-- Flip has no hidden state (#358: every hand is face up), so nothing here is
-- per-viewer redacted the way the wire game's racks are — the whole state
-- blob is safe to broadcast to every seat at the table.

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check
  CHECK (game_type IN ('wire-game', 'spades', 'flip'));

-- Whole-game state blob, mirroring spades_games. One row per game, rewritten
-- on every state transition. Holds everything reconnect needs: the persistent
-- shoe and its order, the discard pile, every player's hand, frozen/busted
-- status, cumulative totals, the dealer seat, whose turn it is, and any
-- pending Freeze / Flip 3 target choice. A single blob (rather than
-- normalised card rows) keeps the engine the sole owner of state shape — the
-- server never has to reconstruct a rule from columns.
CREATE TABLE IF NOT EXISTS flip_games (
  game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flip_games_updated_at
  ON flip_games(updated_at);

-- Per-round scores, one row per player per completed round. Denormalised out
-- of the state blob deliberately: the #365 scoreboard reads round history
-- without deserialising (or depending on the shape of) the engine state, and
-- a finished round's score is an immutable historical fact.
--
-- score is the final round score after the x2 multiplier and the Flip 7
-- bonus, i.e. 0 for a busted hand regardless of what it held (#358), so it
-- can be summed directly for a cumulative total.
CREATE TABLE IF NOT EXISTS flip_round_scores (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  busted BOOLEAN NOT NULL DEFAULT FALSE,
  flip7 BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, round_number, player_id)
);

CREATE INDEX IF NOT EXISTS idx_flip_round_scores_game_round
  ON flip_round_scores(game_id, round_number);
