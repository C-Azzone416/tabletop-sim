import type { FlipCardInstance, FlipPlayerStatus } from './types';

const MODIFIER_PLUS_VALUE: Readonly<Record<string, number>> = {
  '+2': 2,
  '+4': 4,
  '+6': 6,
  '+8': 8,
  '+10': 10,
};

/** True once a hand holds 7 unique number-card values (the `0` counts; modifiers never do). */
export function countUniqueNumbers(hand: readonly FlipCardInstance[]): number {
  const values = new Set<number>();
  for (const card of hand) {
    if (card.kind === 'number') values.add(card.value);
  }
  return values.size;
}

export function isFlip7(hand: readonly FlipCardInstance[]): boolean {
  return countUniqueNumbers(hand) >= 7;
}

export function hasSecondChance(hand: readonly FlipCardInstance[]): boolean {
  return hand.some((card) => card.kind === 'action' && card.action === 'second-chance');
}

/**
 * Round score for one hand. `flip7` marks the player who ended the round by
 * reaching 7 unique numbers — the +15 bonus is added after the x2 multiplier
 * and is never doubled itself.
 */
export function scoreHand(
  hand: readonly FlipCardInstance[],
  status: FlipPlayerStatus,
  flip7: boolean,
): number {
  if (status === 'busted') return 0;

  let numbersSum = 0;
  let plusSum = 0;
  let hasX2 = false;

  for (const card of hand) {
    if (card.kind === 'number') numbersSum += card.value;
    else if (card.kind === 'modifier') {
      if (card.modifier === 'x2') hasX2 = true;
      else plusSum += MODIFIER_PLUS_VALUE[card.modifier]!;
    }
  }

  const base = (numbersSum + plusSum) * (hasX2 ? 2 : 1);
  return base + (flip7 ? 15 : 0);
}
