-- #437 — the host's chosen room capacity, persisted per-room rather than
-- derived from the game's registry ceiling at join time.
--
-- Until now, join_game (game-engine.ts joinGame, line ~106) capped every
-- room at getGameById(gameType).maxPlayers — the game's own ceiling, not
-- anything the host chose. A host who wanted a 3-player room got the
-- game's full ceiling instead (4 for wire-game, 5 for flip) with no way to
-- say otherwise, and nothing in the schema could tell "the host said 3"
-- apart from "the game allows 4".
--
-- Backfilled per game_type to match today's join-gate behaviour exactly, so
-- every room already in flight sees no change in what it accepts. NOT NULL
-- with no static default (mirrors 014_game_type.sql's game_type column):
-- create_game (#437) always sets this explicitly from here on, the same way
-- #313 made it always set game_type.
--
-- No CHECK against the registry's [min, max] here — that bound is dynamic
-- per game_type and only the application layer (engine.createGame, the
-- actual security gate per #437) can look it up. This column only guards
-- against NULL; the range guard lives in code, same split as every other
-- registry-derived bound in the app.
ALTER TABLE games ADD COLUMN IF NOT EXISTS max_players INTEGER;
UPDATE games SET max_players = CASE game_type
  WHEN 'flip' THEN 5
  ELSE 4
END WHERE max_players IS NULL;
ALTER TABLE games ALTER COLUMN max_players SET NOT NULL;
