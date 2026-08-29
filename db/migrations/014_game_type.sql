-- #312 — game_type on games, set at room creation, the back end of the
-- room-entry-flow registry (#314). Renumbered from #282's colliding 010
-- (see #287): develop is at 013.
--
-- NOT NULL is deliberate (#285 Q2 resolved this way): the host always
-- picks a game before the room exists, so there is never a room without a
-- type. DEFAULT 'wire-game' is kept (not dropped after backfill) because
-- #313 — the story that makes create_game set gameType explicitly — has
-- not landed yet; INSERT INTO games (packages/server/src/db/games.ts)
-- still omits the column today, and dropping the default here would break
-- every Wire Game creation until #313 merges. Revisit dropping it once
-- #313's insert sets the column on every row.
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'wire-game';
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN ('wire-game', 'spades'));
CREATE INDEX IF NOT EXISTS idx_games_game_type ON games (game_type);
