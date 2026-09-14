/**
 * Local, presentational-only seat shape for Flip's table UI (#362).
 *
 * Deliberately NOT imported from @tabletop/shared: as of this component,
 * `GameId` doesn't include "flip" yet and there is no Flip `Player`/
 * `ServerMessage` type — that contract belongs to #360 (engine) and #361
 * (server/registry), still in progress. Keeping this interface local and
 * narrow means wiring the real shared type in later is a deletion of this
 * file's definition plus a prop-shape adapter, not an untangling of
 * component internals (same boundary pattern used for #316 ahead of #315).
 */
export interface FlipSeat {
  id: string;
  name: string;
  /** Turn order position, 0-based. Seat rail render order — never re-sort by this at runtime; it's fixed for the whole game. */
  order: number;
  isActive: boolean;
  isDealer: boolean;
  isFrozen: boolean;
  isBusted: boolean;
  /**
   * #434 — a non-host who left mid-game. Terminal, distinct from
   * isFrozen/isBusted (both round-scoped and reset every round): the seat
   * STAYS in the rail — never filtered out — because turn order and
   * dealer rotation are positional (#423) and the engine's own player
   * array never shrinks either, so removing it here would desync the
   * rail's indices from what isDealer/isActive actually mean. Shown as
   * departed, not made to disappear; see TableSeating's own handling
   * (adapters.ts/FlipTable.tsx) for the opposite call at the physical
   * table, where an empty seat has nothing left to show.
   */
  isLeft: boolean;
  /** Cards currently in hand. The "count" that must survive truncation per DESIGN-APPENDIX §8 seat chip rules. */
  cardCount: number;
}
