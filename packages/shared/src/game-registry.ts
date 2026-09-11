// Game registry (#314): one source of truth for selectable games, consumed
// identically by the host game-selection screen (#316) and by server-side
// create_game validation (#313). See the #314 scope ruling: a plain data
// table here, no package extraction, no dependency on #288/#304.

export type GameId = 'wire-game' | 'spades' | 'flip';

export interface GameRegistryEntry {
  id: GameId;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /**
   * Games register here before they're playable (#311 ruling: unavailable
   * games render greyed as "Coming soon", they are not hidden).
   *
   * Flip this LAST, after the real `/play/host` -> lobby -> start -> play path
   * has been walked end to end — not after the game merely works in `/dev`.
   * Holding it caught three live defects on Flip that every other form of
   * testing missed, because each one lived in the real path a dev seed skips:
   *   #404 — the real start dealt wire tiles into a Flip room and created no
   *          Flip state (`/dev/seed` builds that state itself, so it never
   *          exercised the real start)
   *   #406 — every real host landed on a permanently blank lobby, because the
   *          broadcaster sent nothing before a table existed
   *   #407 — the lobby hardcoded Wire Game's cap and blocked a 5th player
   * All three would have shipped to a player's first click.
   */
  available: boolean;
}

// Frozen at both levels (not just `readonly` at the type level, which erases
// at compile time): #313 uses this as a security allowlist for create_game,
// so it must not be mutable at runtime.
export const GAME_REGISTRY: readonly GameRegistryEntry[] = Object.freeze([
  Object.freeze({
    id: 'wire-game',
    displayName: 'Wire Game',
    description: 'Cut the right wires as a team before the detonator runs out.',
    minPlayers: 2,
    maxPlayers: 4,
    available: true,
  }),
  Object.freeze({
    id: 'spades',
    displayName: 'Spades',
    description: 'Classic trick-taking card game for four players in two partnerships.',
    minPlayers: 4,
    maxPlayers: 4,
    available: false,
  }),
  Object.freeze({
    id: 'flip',
    displayName: 'Flip',
    description: 'Press your luck: keep flipping cards for a bigger score, but a duplicate busts your hand.',
    minPlayers: 2,
    maxPlayers: 5,
    available: true,
  }),
]);

export function getGameById(id: string): GameRegistryEntry | undefined {
  return GAME_REGISTRY.find((game) => game.id === id);
}

export function isAvailableGameId(id: string): id is GameId {
  return getGameById(id)?.available === true;
}
