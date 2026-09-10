/**
 * Bridges the engine draft shape (engine-types.ts) to the presentational
 * FlipSeat shape SeatRail already takes. Keeping this as one small pure
 * function means a real shape change from #360 touches this file and
 * FlipTable's props, not SeatRail/Card/Hand internals.
 */

import type { FlipGameState } from "./engine-types";
import type { FlipSeat } from "./types";

export function toSeats(game: FlipGameState): FlipSeat[] {
  return game.players.map((player, order) => ({
    id: player.id,
    name: player.name,
    order,
    isActive: player.id === game.turnPlayerId,
    isDealer: order === game.dealerIndex,
    isFrozen: player.status === "frozen",
    isBusted: player.status === "busted",
    cardCount: player.hand.length,
  }));
}
