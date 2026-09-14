import type { Game } from "@tabletop/shared";

/**
 * Reads the room's game type out of room state (#319).
 *
 * `Game.gameType` is required (#313/#314/#312 — `GameId`, NOT NULL with a
 * CHECK, rejected server-side if missing), so this returns `null` only when
 * `game` itself is `null`/`undefined` — room state has not loaded yet, not
 * "this room has no game type." Room state is the single source of truth
 * for the room's game type — this function deliberately has no fallback of
 * its own and never consults the game registry.
 */
export function readRoomGameType(game: Game | null | undefined): string | null {
  return game?.gameType ?? null;
}
