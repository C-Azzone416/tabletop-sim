// Game registry (#314): one source of truth for selectable games, consumed
// identically by the host game-selection screen (#316) and by server-side
// create_game validation (#313). See the #314 scope ruling: a plain data
// table here, no package extraction, no dependency on #288/#304.

export type GameId = 'wire-game' | 'spades';

export interface GameRegistryEntry {
  id: GameId;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /**
   * Games register here before they're playable (#311 ruling: unavailable
   * games render greyed as "Coming soon", they are not hidden).
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
]);

export function getGameById(id: string): GameRegistryEntry | undefined {
  return GAME_REGISTRY.find((game) => game.id === id);
}

export function isAvailableGameId(id: string): id is GameId {
  return getGameById(id)?.available === true;
}
