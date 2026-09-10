// #370 — the stacked-deck scenarios themselves (epic #358).
//
// Random dealing will almost never produce the cases most likely to be
// broken, and the Flip 3 interruption rules are close to untestable by hand
// without a known deck. Each builder below puts the table in one exact state,
// every time, so a scenario is one click from /dev and reproducible.
//
// These are DATA, not rules. Every state is assembled by the engine's own
// `buildFlipGameState`, which validates deck conservation and rejects
// impossible hands — so a malformed scenario fails here rather than surfacing
// as a confusing bug three mutator calls later. Nothing in this file decides
// what a card does; it only decides which cards are where before play resumes.
//
// Convention throughout: `shoe` index 0 is the next card drawn, and the seat
// named `turnPlayerId` is the one whose Hit will draw it. That pairing is what
// makes each scenario land on its case with a single action.

import {
  buildFlipDeck,
  buildFlipGameState,
  flipCards,
  type FlipCardDefinition,
  type FlipCardInstance,
  type FlipGameState,
} from '@tabletop/game-flip';
import type { FlipScenarioName } from './flip-scenarios.js';

export interface FlipScenarioSeat {
  readonly id: string;
  readonly name: string;
}

type ScenarioBuilder = (seats: readonly FlipScenarioSeat[]) => FlipGameState;

/** Seats beyond the ones a scenario cares about still need to exist and be sane. */
function seatAt(seats: readonly FlipScenarioSeat[], index: number): FlipScenarioSeat {
  return seats[index % seats.length]!;
}

function signature(card: FlipCardDefinition): string {
  if (card.kind === 'number') return `number:${card.value}`;
  if (card.kind === 'modifier') return `modifier:${card.modifier}`;
  return `action:${card.action}`;
}

/**
 * A full 94-card-conserving shoe with `top` as the next cards drawn and the
 * rest of the canonical deck behind them, in a fixed order.
 *
 * `buildFlipGameState` accepts either an omitted shoe (which it fills and
 * shuffles itself) or a complete one it can verify against the canonical
 * deck — there is no "stack these on top" option, and a short explicit shoe
 * is correctly rejected as not conserving the deck. This composes the engine's
 * own `buildFlipDeck` to bridge that: it is deck bookkeeping over an exported
 * engine primitive, not a re-implementation of any rule.
 *
 * Deliberately NOT shuffled: a scenario must produce the same table every
 * time, and cards behind the stacked ones still get drawn once a scenario runs
 * past its setup.
 */
function stackedShoe(
  top: readonly FlipCardInstance[],
  placed: readonly FlipCardInstance[],
): FlipCardInstance[] {
  const remaining = buildFlipDeck('rest');
  for (const card of [...top, ...placed]) {
    const index = remaining.findIndex((candidate) => signature(candidate) === signature(card));
    if (index === -1) {
      throw new Error(
        `scenario places more "${signature(card)}" cards than the Flip deck contains`,
      );
    }
    remaining.splice(index, 1);
  }
  return [...top, ...remaining];
}

const builders: Record<FlipScenarioName, ScenarioBuilder> = {
  // Six unique numbers held, the seventh on top. One Hit ends the round with
  // a Flip 7: +15 on top of the hand, and every other player scores what they
  // hold at that moment.
  'flip7-ready': (seats) => {
    const hero = seatAt(seats, 1);
    const hand = flipCards(['1', '2', '3', '4', '5', '6']);
    return buildFlipGameState({
      players: [...seats],
      hands: { [hero.id]: hand },
      shoe: stackedShoe(flipCards(['7']), hand),
      turnPlayerId: hero.id,
    });
  },

  // Flip 3 on top for the flipper; the chosen target holds a duplicate of the
  // very next card. Exercises "target busts -> remaining cards are NOT dealt".
  'flip3-bust': (seats) => {
    const flipper = seatAt(seats, 1);
    const target = seatAt(seats, 2);
    const flipperHand = flipCards(['2']);
    const targetHand = flipCards(['9']);
    return buildFlipGameState({
      players: [...seats],
      hands: { [flipper.id]: flipperHand, [target.id]: targetHand },
      // flipper draws Flip 3; the target is then dealt 9 (a duplicate -> bust),
      // and the two cards behind it must never reach the table.
      shoe: stackedShoe(flipCards(['flip3', '9', '4', '5']), [...flipperHand, ...targetHand]),
      turnPlayerId: flipper.id,
    });
  },

  // A Flip 3 whose dealt cards contain another Flip 3. The nested one resolves
  // fully, then the outstanding flips of the outer one continue.
  'flip3-nested': (seats) => {
    const flipper = seatAt(seats, 1);
    const hand = flipCards(['2']);
    return buildFlipGameState({
      players: [...seats],
      hands: { [flipper.id]: hand },
      shoe: stackedShoe(flipCards(['flip3', '3', 'flip3', '4', '5', '6', '7']), hand),
      turnPlayerId: flipper.id,
    });
  },

  // A Freeze drawn during a Flip 3. Freeze wins: the remaining cards stop.
  'flip3-freeze': (seats) => {
    const flipper = seatAt(seats, 1);
    const hand = flipCards(['2']);
    return buildFlipGameState({
      players: [...seats],
      hands: { [flipper.id]: hand },
      shoe: stackedShoe(flipCards(['flip3', '3', 'freeze', '4', '5']), hand),
      turnPlayerId: flipper.id,
    });
  },

  // Holding a Second Chance with a duplicate on top: the save path. Both cards
  // discard, the turn ends, and no bust is recorded.
  'second-chance-save': (seats) => {
    const hero = seatAt(seats, 1);
    const hand = flipCards(['9', 'second-chance']);
    return buildFlipGameState({
      players: [...seats],
      hands: { [hero.id]: hand },
      shoe: stackedShoe(flipCards(['9']), hand),
      turnPlayerId: hero.id,
    });
  },

  // A save partway through a Flip 3. Unlike a bust or a freeze, surviving does
  // NOT end the target's participation, so the deal must continue.
  'second-chance-midflip3': (seats) => {
    const flipper = seatAt(seats, 1);
    const target = seatAt(seats, 2);
    const flipperHand = flipCards(['2']);
    const targetHand = flipCards(['9', 'second-chance']);
    return buildFlipGameState({
      players: [...seats],
      hands: { [flipper.id]: flipperHand, [target.id]: targetHand },
      // Flip 3 -> target draws 9 (saved by the Second Chance) -> the 4 and 5
      // behind it must STILL be dealt: surviving does not end participation.
      shoe: stackedShoe(flipCards(['flip3', '9', '4', '5']), [...flipperHand, ...targetHand]),
      turnPlayerId: flipper.id,
    });
  },

  // Three cards left mid-round: the fourth draw forces the discard to be
  // shuffled back in immediately, with no round boundary.
  //
  // The only scenario that does not use stackedShoe — a near-empty shoe is
  // the entire point, so the rest of the deck genuinely has to be somewhere
  // else, and the discard is where a mid-game deck would actually be.
  'deck-exhaustion': (seats) => {
    const hero = seatAt(seats, 1);
    const hand = flipCards(['2']);
    const shoe = flipCards(['3', '4', '5']);
    const discard = stackedShoe([], [...hand, ...shoe]);
    return buildFlipGameState({
      players: [...seats],
      hands: { [hero.id]: hand },
      shoe,
      discard,
      turnPlayerId: hero.id,
    });
  },

  // Players parked just below the line, so one scored round exercises the win
  // check at 200+ and the highest-final-round tie-break.
  'near-200': (seats) => {
    // The first two seats are level at 199 so a tie at 200+ is reachable in a
    // single round — the tie-break only matters when the leaders are level.
    const totals: Record<string, number> = {};
    seats.forEach((seat, index) => {
      totals[seat.id] = index < 2 ? 199 : 180;
    });
    const hero = seatAt(seats, 1);
    const hand = flipCards(['5']);
    return buildFlipGameState({
      players: [...seats],
      totalScores: totals,
      hands: { [hero.id]: hand },
      shoe: stackedShoe(flipCards(['6']), hand),
      turnPlayerId: hero.id,
    });
  },
};

/**
 * Builds the exact table state for a named scenario.
 *
 * The shoe is deliberately short in most scenarios: `buildFlipGameState`
 * fills the rest of the canonical deck in behind whatever is specified, so a
 * scenario only names the cards it actually depends on and the table is still
 * a legal 94-card game.
 */
export function buildFlipScenarioState(
  scenario: FlipScenarioName,
  seats: readonly FlipScenarioSeat[],
): FlipGameState {
  return builders[scenario](seats);
}
