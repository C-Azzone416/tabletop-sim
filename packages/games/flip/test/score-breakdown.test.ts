import { describe, it, expect } from 'vitest';
import { flipCards } from '../src/flip-cards';
import { scoreHand, scoreHandBreakdown } from '../src/scoring';

// #365 — the scoreboard has to show a Flip 7's +15 as its own term and a `x2`
// as a multiplier applied, and neither is recoverable from the total alone:
// 30 is both (15 numbers x2) and (15 numbers + 15 bonus). These pin the
// components, and — most importantly — that the breakdown's `total` is always
// the same number scoreHand returns, so the explanation can never disagree
// with the score actually awarded.

describe('scoreHandBreakdown', () => {
  it('splits number cards from + cards', () => {
    const breakdown = scoreHandBreakdown(flipCards(['7', '5', '+4']), 'active', false);

    expect(breakdown).toMatchObject({
      numbersSum: 12,
      plusSum: 4,
      hasX2: false,
      flip7Bonus: 0,
      total: 16,
      busted: false,
    });
  });

  it('reports x2 separately rather than folding it into the sums', () => {
    const breakdown = scoreHandBreakdown(flipCards(['7', '5', '+4', 'x2']), 'active', false);

    expect(breakdown.numbersSum).toBe(12);
    expect(breakdown.plusSum).toBe(4);
    expect(breakdown.hasX2).toBe(true);
    expect(breakdown.total).toBe(32);
  });

  it('counts the 0 card as a scoring 0, not as nothing', () => {
    const breakdown = scoreHandBreakdown(flipCards(['0', '3']), 'active', false);
    expect(breakdown.numbersSum).toBe(3);
    expect(breakdown.total).toBe(3);
  });

  it('reports the Flip 7 bonus as its own field', () => {
    const breakdown = scoreHandBreakdown(flipCards(['1', '2', '3', '4', '5', '6', '0']), 'active', true);

    expect(breakdown.numbersSum).toBe(21);
    expect(breakdown.flip7Bonus).toBe(15);
    expect(breakdown.total).toBe(36);
  });

  // #358: the bonus is added AFTER the multiplier and is never doubled.
  it('never doubles the Flip 7 bonus, even holding x2', () => {
    const breakdown = scoreHandBreakdown(
      flipCards(['1', '2', '3', '4', '5', '6', '0', 'x2']),
      'active',
      true,
    );

    expect(breakdown.hasX2).toBe(true);
    expect(breakdown.flip7Bonus).toBe(15);
    // (21 + 0) x2 = 42, then + 15 = 57 — not (21 + 15) x2 = 72.
    expect(breakdown.total).toBe(57);
  });

  // #358: a busted hand scores 0 regardless of what it held, modifiers
  // included — so the breakdown must not advertise points it isn't awarding.
  it('zeroes every component for a busted hand holding +10 and x2', () => {
    const breakdown = scoreHandBreakdown(flipCards(['9', '9', '+10', 'x2']), 'busted', false);

    expect(breakdown).toEqual({
      numbersSum: 0,
      plusSum: 0,
      hasX2: false,
      flip7Bonus: 0,
      total: 0,
      busted: true,
    });
  });

  it('ignores held action cards, which never score', () => {
    const withSecondChance = scoreHandBreakdown(flipCards(['7', 'second-chance']), 'active', false);
    expect(withSecondChance.total).toBe(7);
    expect(withSecondChance.numbersSum).toBe(7);
  });

  it('scores an empty hand as a clean zero that is not a bust', () => {
    expect(scoreHandBreakdown([], 'active', false)).toEqual({
      numbersSum: 0,
      plusSum: 0,
      hasX2: false,
      flip7Bonus: 0,
      total: 0,
      busted: false,
    });
  });

  // The whole point of the refactor: one implementation, so a scoreboard
  // built on the breakdown can never show a number that disagrees with the
  // score the engine awarded.
  it.each([
    { hand: ['7', '5', '+4'], status: 'active' as const, flip7: false },
    { hand: ['7', '5', '+4', 'x2'], status: 'active' as const, flip7: false },
    { hand: ['1', '2', '3', '4', '5', '6', '0'], status: 'active' as const, flip7: true },
    { hand: ['1', '2', '3', '4', '5', '6', '0', 'x2'], status: 'active' as const, flip7: true },
    { hand: ['9', '9', '+10', 'x2'], status: 'busted' as const, flip7: false },
    { hand: [], status: 'active' as const, flip7: false },
    { hand: ['12', '+2', '+4', '+6', '+8', '+10'], status: 'active' as const, flip7: false },
  ])('total always equals scoreHand for the same hand (%#)', ({ hand, status, flip7 }) => {
    const cards = flipCards(hand);
    expect(scoreHandBreakdown(cards, status, flip7).total).toBe(scoreHand(cards, status, flip7));
  });

  // #358 states the best possible round is 201; that is the breakdown's job
  // to explain, not just to total.
  it('explains the 201-point maximum round', () => {
    const breakdown = scoreHandBreakdown(
      flipCards(['12', '11', '10', '9', '8', '7', '6', '+2', '+4', '+6', '+8', '+10', 'x2']),
      'active',
      true,
    );

    expect(breakdown.numbersSum).toBe(63);
    expect(breakdown.plusSum).toBe(30);
    expect(breakdown.hasX2).toBe(true);
    expect(breakdown.flip7Bonus).toBe(15);
    // (63 + 30) x2 = 186, + 15 = 201.
    expect(breakdown.total).toBe(201);
  });
});
