import { describe, expect, it } from 'vitest';
import { shuffleCards } from '@tabletop/shared';

/** Deterministic LCG so shuffle order is replayable across test runs. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe('shuffleCards', () => {
  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];

    shuffleCards(input, seededRandom(1));

    expect(input).toEqual(copy);
  });

  it('returns a new array instance', () => {
    const input = [1, 2, 3];

    expect(shuffleCards(input, seededRandom(1))).not.toBe(input);
  });

  it('preserves the same elements, just reordered', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];

    const result = shuffleCards(input, seededRandom(42));

    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('is deterministic for a given seeded random function', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];

    const first = shuffleCards(input, seededRandom(7));
    const second = shuffleCards(input, seededRandom(7));

    expect(first).toEqual(second);
  });

  it('produces a different order for a different seed', () => {
    const input = Array.from({ length: 20 }, (_, index) => index);

    const first = shuffleCards(input, seededRandom(1));
    const second = shuffleCards(input, seededRandom(2));

    expect(first).not.toEqual(second);
  });

  it('handles an empty array', () => {
    expect(shuffleCards([], seededRandom(1))).toEqual([]);
  });

  it('handles a single-element array', () => {
    expect(shuffleCards([1], seededRandom(1))).toEqual([1]);
  });

  it('defaults to Math.random when no random function is provided', () => {
    const input = [1, 2, 3, 4, 5];

    const result = shuffleCards(input);

    expect([...result].sort()).toEqual([...input].sort());
  });
});
