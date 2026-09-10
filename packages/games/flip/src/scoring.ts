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
 * #365 — where a round's points came from. The scoreboard has to show a Flip
 * 7's +15 as a distinct term and a `x2` as a multiplier applied, and neither
 * is recoverable from the total alone: 30 could be (15 numbers x2) or
 * (15 numbers + 15 bonus). Exposed here rather than recomputed by the
 * scoreboard because summing card values, and knowing that `x2` doubles the
 * `+` cards but never the Flip 7 bonus, IS the scoring rule.
 */
export interface FlipScoreBreakdown {
  readonly numbersSum: number;
  readonly plusSum: number;
  readonly hasX2: boolean;
  /** 15 or 0. Added after the multiplier, never doubled. */
  readonly flip7Bonus: number;
  /** Identical to `scoreHand` for the same arguments — the number of record. */
  readonly total: number;
  /** True ⇒ every other field is 0: a busted hand scores nothing it held. */
  readonly busted: boolean;
}

export function scoreHandBreakdown(
  hand: readonly FlipCardInstance[],
  status: FlipPlayerStatus,
  flip7: boolean,
): FlipScoreBreakdown {
  if (status === 'busted') {
    return { numbersSum: 0, plusSum: 0, hasX2: false, flip7Bonus: 0, total: 0, busted: true };
  }

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

  const flip7Bonus = flip7 ? 15 : 0;
  const total = (numbersSum + plusSum) * (hasX2 ? 2 : 1) + flip7Bonus;

  return { numbersSum, plusSum, hasX2, flip7Bonus, total, busted: false };
}

/**
 * Round score for one hand. `flip7` marks the player who ended the round by
 * reaching 7 unique numbers — the +15 bonus is added after the x2 multiplier
 * and is never doubled itself.
 *
 * Delegates so there is exactly one implementation of the rule and the total
 * can never drift from the breakdown that explains it.
 */
export function scoreHand(
  hand: readonly FlipCardInstance[],
  status: FlipPlayerStatus,
  flip7: boolean,
): number {
  return scoreHandBreakdown(hand, status, flip7).total;
}
