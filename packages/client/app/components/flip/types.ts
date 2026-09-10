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
  /** Cards currently in hand. The "count" that must survive truncation per DESIGN-APPENDIX §8 seat chip rules. */
  cardCount: number;
}
