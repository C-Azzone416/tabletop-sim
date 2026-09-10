import { describe, expect, it } from 'vitest';
import { buildFlipDeck, drawFromShoe, FLIP_DECK_SIZE } from '@tabletop/game-flip';

describe('buildFlipDeck', () => {
  it('contains exactly 94 cards', () => {
    const deck = buildFlipDeck();
    expect(deck).toHaveLength(94);
    expect(FLIP_DECK_SIZE).toBe(94);
  });

  it('has unique ids for every card', () => {
    const deck = buildFlipDeck();
    expect(new Set(deck.map((card) => card.id)).size).toBe(deck.length);
  });

  it('has one 0 and n copies of n for 1..12 (79 number cards)', () => {
    const deck = buildFlipDeck();
    const numbers = deck.filter((card) => card.kind === 'number');
    expect(numbers).toHaveLength(79);

    const counts = new Map<number, number>();
    for (const card of numbers) counts.set(card.value, (counts.get(card.value) ?? 0) + 1);

    expect(counts.get(0)).toBe(1);
    for (let value = 1; value <= 12; value += 1) {
      expect(counts.get(value)).toBe(value);
    }
  });

  it('has exactly one of each modifier (6 total)', () => {
    const deck = buildFlipDeck();
    const modifiers = deck.filter((card) => card.kind === 'modifier');
    expect(modifiers).toHaveLength(6);
    expect(new Set(modifiers.map((card) => card.modifier)).size).toBe(6);
  });

  it('has 3 each of Freeze, Flip 3, and Second Chance (9 action cards)', () => {
    const deck = buildFlipDeck();
    const actions = deck.filter((card) => card.kind === 'action');
    expect(actions).toHaveLength(9);
    expect(actions.filter((card) => card.action === 'freeze')).toHaveLength(3);
    expect(actions.filter((card) => card.action === 'flip3')).toHaveLength(3);
    expect(actions.filter((card) => card.action === 'second-chance')).toHaveLength(3);
  });
});

describe('drawFromShoe', () => {
  it('draws the top of the shoe without touching the discard', () => {
    const deck = buildFlipDeck();
    const result = drawFromShoe(deck, [], () => 0);
    expect(result.card).toBe(deck[0]);
    expect(result.shoe).toEqual(deck.slice(1));
    expect(result.discard).toEqual([]);
  });

  it('reshuffles the discard into the shoe immediately when the shoe is empty', () => {
    const deck = buildFlipDeck();
    const result = drawFromShoe([], deck, () => 0.5);
    expect(result.discard).toEqual([]);
    expect(result.shoe).toHaveLength(deck.length - 1);
    expect([...result.shoe, result.card].map((c) => c.id).sort()).toEqual(deck.map((c) => c.id).sort());
  });

  it('throws when both the shoe and discard are empty', () => {
    expect(() => drawFromShoe([], [], () => 0)).toThrow();
  });
});
