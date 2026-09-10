import { describe, expect, it } from 'vitest';
import { buildFlipDeck, buildFlipGameState, flipCards } from '@tabletop/game-flip';

describe('flipCards', () => {
  it('parses number, modifier, and action specs', () => {
    const cards = flipCards(['7', '0', '+4', 'x2', 'freeze', 'flip3', 'second-chance']);
    expect(cards.map((c) => c.kind)).toEqual([
      'number',
      'number',
      'modifier',
      'modifier',
      'action',
      'action',
      'action',
    ]);
    expect((cards[0] as { value: number }).value).toBe(7);
    expect((cards[3] as { modifier: string }).modifier).toBe('x2');
    expect((cards[4] as { action: string }).action).toBe('freeze');
  });

  it('mints unique ids across calls', () => {
    const first = flipCards(['1']);
    const second = flipCards(['1']);
    expect(first[0]!.id).not.toBe(second[0]!.id);
  });

  it('rejects an out-of-range number or unrecognized spec', () => {
    expect(() => flipCards(['13'])).toThrow();
    expect(() => flipCards(['banana'])).toThrow();
  });
});

describe('buildFlipGameState', () => {
  it('builds a live mid-round state from just hands, auto-filling the rest', () => {
    const state = buildFlipGameState({
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      hands: {
        a: flipCards(['1', '2', '3']),
        b: flipCards(['9']),
      },
      random: () => 0.42,
    });

    expect(state.phase).toBe('round-in-progress');
    expect(state.roundNumber).toBe(1);
    expect(state.dealerIndex).toBe(0);
    expect(state.players.find((p) => p.id === 'a')!.hand).toHaveLength(3);
    expect(state.players.find((p) => p.id === 'b')!.hand).toHaveLength(1);
    // default turn: first active seat after the dealer
    expect(state.turnPlayerId).toBe('b');
    // auto-filled shoe carries the rest of the 94-card deck
    expect(state.shoe).toHaveLength(94 - 4);
  });

  it('supports statuses, totalScores, dealerIndex, roundNumber, and phase overrides', () => {
    const state = buildFlipGameState({
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      statuses: { b: 'frozen', c: 'busted' },
      totalScores: { a: 120 },
      dealerIndex: 1,
      roundNumber: 4,
      phase: 'awaiting-round-start',
    });

    expect(state.players.find((p) => p.id === 'a')!.totalScore).toBe(120);
    expect(state.players.find((p) => p.id === 'b')!.status).toBe('frozen');
    expect(state.players.find((p) => p.id === 'c')!.status).toBe('busted');
    expect(state.dealerIndex).toBe(1);
    expect(state.roundNumber).toBe(4);
    expect(state.phase).toBe('awaiting-round-start');
    expect(state.turnPlayerId).toBeNull();
  });

  it('reproduces one of #370\'s scenario shapes: a Flip 3-in-progress mid-nested-resolution state', () => {
    const state = buildFlipGameState({
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      hands: {
        a: flipCards(['5']),
        b: flipCards(['1', '2']),
      },
      turnPlayerId: 'a',
      pendingAction: { kind: 'flip3' },
      flip3Stack: [{ targetId: 'b', remaining: 1 }],
    });

    expect(state.pendingAction).toEqual({ kind: 'flip3' });
    expect(state.flip3Stack).toEqual([{ targetId: 'b', remaining: 1 }]);
    expect(state.turnPlayerId).toBe('a');
  });

  it('accepts an explicit shoe in place of auto-filling', () => {
    const deck = buildFlipDeck();
    const state = buildFlipGameState({
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      shoe: deck,
    });
    expect(state.shoe.map((c) => c.id)).toEqual(deck.map((c) => c.id));
  });

  it('rejects duplicate card instance ids', () => {
    const dup = flipCards(['5'])[0]!;
    expect(() =>
      buildFlipGameState({
        players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        hands: { a: [dup], b: [dup] },
      }),
    ).toThrow();
  });

  it('rejects an impossible hand holding a duplicate number value', () => {
    expect(() =>
      buildFlipGameState({
        players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        hands: { a: flipCards(['5', '5']) },
      }),
    ).toThrow(/duplicate number/);
  });

  it('rejects a hand holding more than one Second Chance', () => {
    expect(() =>
      buildFlipGameState({
        players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        hands: { a: flipCards(['second-chance', 'second-chance']) },
      }),
    ).toThrow(/Second Chance/);
  });

  it('rejects placing more copies of a card than the canonical deck has', () => {
    // only one `0` card exists in the whole deck
    expect(() =>
      buildFlipGameState({
        players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        hands: { a: flipCards(['0']), b: flipCards(['0']) },
      }),
    ).toThrow();
  });

  it('rejects a turnPlayerId, flip3Stack target, or dealQueue entry naming an unknown player', () => {
    const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    expect(() => buildFlipGameState({ players, turnPlayerId: 'ghost' })).toThrow(/unknown player/);
    expect(() =>
      buildFlipGameState({ players, flip3Stack: [{ targetId: 'ghost', remaining: 2 }] }),
    ).toThrow(/unknown player/);
    expect(() => buildFlipGameState({ players, dealQueue: ['ghost'] })).toThrow(/unknown player/);
  });

  it('rejects a pendingAction outside round-in-progress, or without a turnPlayerId', () => {
    const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    expect(() =>
      buildFlipGameState({ players, phase: 'awaiting-round-start', pendingAction: { kind: 'freeze' }, turnPlayerId: 'a' }),
    ).toThrow(/pendingAction/);
    expect(() =>
      buildFlipGameState({ players, pendingAction: { kind: 'freeze' }, turnPlayerId: undefined, dealQueue: [] }),
    ).toThrow(/pendingAction/);
  });

  it('rejects an out-of-range dealerIndex', () => {
    const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    expect(() => buildFlipGameState({ players, dealerIndex: 5 })).toThrow(/dealerIndex/);
  });

  it('rejects fewer than two or more than five players', () => {
    expect(() => buildFlipGameState({ players: [{ id: 'a', name: 'A' }] })).toThrow();
    const sixPlayers = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(() => buildFlipGameState({ players: sixPlayers })).toThrow();
  });
});
