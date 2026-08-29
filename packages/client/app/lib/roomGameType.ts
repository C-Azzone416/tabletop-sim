import type { Game } from "@tabletop/shared";

/**
 * Reads the room's game type out of room state (#319).
 *
 * INTEGRATION POINT. `Game.gameType` is added by #313 (PR #325), which has not
 * merged: on `develop` today the field does not exist on the shared `Game`
 * type, so this reads it defensively and returns null when it is absent. Room
 * state is the single source of truth for the room's game type — this function
 * deliberately has no fallback of its own and never consults the game registry,
 * so a genuinely missing value stays visible instead of being masked.
 *
 * Once #325 has merged, the cast below collapses to `game?.gameType ?? null`.
 */
export function readRoomGameType(game: Game | null | undefined): string | null {
  const gameType = (game as (Game & { gameType?: unknown }) | null | undefined)?.gameType;
  return typeof gameType === "string" && gameType.length > 0 ? gameType : null;
}
