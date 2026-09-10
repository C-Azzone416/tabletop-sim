import { describe, expect, it } from 'vitest';
import { countUniqueNumbers, hasSecondChance, isFlip7, scoreHand } from '@tabletop/game-flip';
import type { FlipCardInstance } from '@tabletop/game-flip';

let sequence = 0;
const number = (value: number): FlipCardInstance => ({ id: `n${sequence++}`, kind: 'number', value: value as never });
const modifier = (modifierValue: string): FlipCardInstance => ({
  id: `m${sequence++}`,
  kind: 'modifier',
  modifier: modifierValue as never,
});
const action = (kind: string): FlipCardInstance => ({ id: `a${sequence++}`, kind: 'action', action: kind as never });

describe('countUniqueNumbers / isFlip7', () => {
  it('counts unique number values only, ignoring modifiers and actions', () => {
    const hand = [number(1), number(2), modifier('x2'), action('second-chance')];
    expect(countUniqueNumbers(hand)).toBe(2);
    expect(isFlip7(hand)).toBe(false);
  });

  it('is Flip 7 at exactly 7 unique numbers', () => {
    const hand = [1, 2, 3, 4, 5, 6, 7].map(number);
    expect(countUniqueNumbers(hand)).toBe(7);
    expect(isFlip7(hand)).toBe(true);
  });

  it('counts the 0 card toward the 7', () => {
    const hand = [0, 1, 2, 3, 4, 5, 6].map(number);
    expect(isFlip7(hand)).toBe(true);
  });

  it('does not count modifiers toward the 7 even with 7 of them', () => {
    const hand = [1, 2, 3, 4, 5, 6].map(number).concat(modifier('x2'));
    expect(isFlip7(hand)).toBe(false);
  });
});

describe('hasSecondChance', () => {
  it('detects a held Second Chance card', () => {
    expect(hasSecondChance([number(1), action('second-chance')])).toBe(true);
    expect(hasSecondChance([number(1), action('freeze')])).toBe(false);
  });
});

describe('scoreHand', () => {
  it('sums number cards', () => {
    const hand = [number(3), number(5), number(0)];
    expect(scoreHand(hand, 'active', false)).toBe(8);
  });

  it('sums + modifiers into the total', () => {
    const hand = [number(3), modifier('+4'), modifier('+2')];
    expect(scoreHand(hand, 'active', false)).toBe(9);
  });

  it('doubles numbers and + cards when x2 is held', () => {
    const hand = [number(3), modifier('+4'), modifier('x2')];
    expect(scoreHand(hand, 'active', false)).toBe((3 + 4) * 2);
  });

  it('adds the +15 Flip 7 bonus after the multiplier, never doubled', () => {
    const hand = [number(3), modifier('x2')];
    expect(scoreHand(hand, 'active', true)).toBe(3 * 2 + 15);
  });

  it('ignores action cards entirely for scoring', () => {
    const hand = [number(3), action('second-chance')];
    expect(scoreHand(hand, 'active', false)).toBe(3);
  });

  it('scores 0 for a busted hand regardless of held cards, including +10 and x2', () => {
    const hand = [number(9), modifier('+10'), modifier('x2')];
    expect(scoreHand(hand, 'busted', false)).toBe(0);
  });

  it('proves the maximum possible round is 201', () => {
    const hand = [6, 7, 8, 9, 10, 11, 12].map(number).concat([
      modifier('+2'),
      modifier('+4'),
      modifier('+6'),
      modifier('+8'),
      modifier('+10'),
      modifier('x2'),
    ]);
    const numbersSum = 6 + 7 + 8 + 9 + 10 + 11 + 12;
    const plusSum = 2 + 4 + 6 + 8 + 10;
    expect((numbersSum + plusSum) * 2 + 15).toBe(201);
    expect(scoreHand(hand, 'active', true)).toBe(201);
  });
});
