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
    // #435 — raised from 2-4 to 3-5. The 2-player path is deliberately kept
    // (not deleted, per the dead-code policy's own exception for a
    // Caroline-parked case) — it's just no longer offered as a selectable
    // host count. Raised last, only after a real 5-player game was played
    // host -> lobby -> start (not /dev/seed) — the same gate that caught
    // #404, #406 and #407.
    minPlayers: 3,
    maxPlayers: 5,
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
    // #436 — raised from 2 to 3. 6 is #439, blocked: TableSeating's
    // OPPONENT_POSITIONS only covers 1-4 opponents and silently drops a 5th
    // opponent's hand via Math.min(...,4), so 6 seats would ship a game that
    // omits a player with no error.
    minPlayers: 3,
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
