import { shuffleCards } from '@tabletop/shared';
import {
  FLIP_ACTION_KINDS,
  FLIP_MODIFIER_VALUES,
  type FlipCardDefinition,
  type FlipCardInstance,
  type FlipNumberValue,
} from './types';

export const FLIP_DECK_SIZE = 94;

/** One `0`, then n copies of card n for n = 1..12; +modifiers; action cards. */
function buildDefinitions(): FlipCardDefinition[] {
  const definitions: FlipCardDefinition[] = [{ kind: 'number', value: 0 }];
  for (let value = 1; value <= 12; value += 1) {
    for (let copy = 0; copy < value; copy += 1) {
      definitions.push({ kind: 'number', value: value as FlipNumberValue });
    }
  }
  for (const modifier of FLIP_MODIFIER_VALUES) {
    definitions.push({ kind: 'modifier', modifier });
  }
  for (const action of FLIP_ACTION_KINDS) {
    for (let copy = 0; copy < 3; copy += 1) {
      definitions.push({ kind: 'action', action });
    }
  }
  return definitions;
}

/** Builds the canonical 94-card Flip deck, freshly instanced with unique ids. */
export function buildFlipDeck(idPrefix = 'flip'): FlipCardInstance[] {
  return buildDefinitions().map((definition, index) => ({
    ...definition,
    id: `${idPrefix}:${index}`,
  }));
}

export interface FlipDrawResult {
  readonly card: FlipCardInstance;
  readonly shoe: readonly FlipCardInstance[];
  readonly discard: readonly FlipCardInstance[];
}

/**
 * Draws the top card of the shoe. If the shoe is empty, the discard pile is
 * shuffled back in immediately (no round boundary required) before drawing.
 */
export function drawFromShoe(
  shoe: readonly FlipCardInstance[],
  discard: readonly FlipCardInstance[],
  random: () => number,
): FlipDrawResult {
  if (shoe.length > 0) {
    const [card, ...rest] = shoe;
    return { card: card!, shoe: rest, discard };
  }
  if (discard.length === 0) {
    throw new Error('cannot draw: shoe and discard are both empty');
  }
  const reshuffled = shuffleCards(discard, random);
  const [card, ...rest] = reshuffled;
  return { card: card!, shoe: rest, discard: [] };
}
