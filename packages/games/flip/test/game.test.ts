import { describe, expect, it } from 'vitest';
import {
  chooseFlip3Target,
  chooseFreezeTarget,
  freeze,
  hit,
  startFlipGame,
  startRound,
  type FlipCardInstance,
  type FlipGameState,
  type FlipPlayerState,
} from '@tabletop/game-flip';

let sequence = 0;
const numberCard = (value: number): FlipCardInstance => ({
  id: `n${sequence++}:${value}`,
  kind: 'number',
  value: value as never,
});
const modifierCard = (modifier: string): FlipCardInstance => ({
  id: `m${sequence++}:${modifier}`,
  kind: 'modifier',
  modifier: modifier as never,
});
const actionCard = (action: string): FlipCardInstance => ({
  id: `a${sequence++}:${action}`,
  kind: 'action',
  action: action as never,
});

const noRandom = (): number => {
  throw new Error('random should not be called in this test');
};

function makePlayer(id: string, overrides: Partial<FlipPlayerState> = {}): FlipPlayerState {
  return { id, name: id, status: 'active', hand: [], totalScore: 0, ...overrides };
}

function baseState(
  players: FlipPlayerState[],
  shoe: FlipCardInstance[],
  overrides: Partial<FlipGameState> = {},
): FlipGameState {
  return {
    players,
    dealerIndex: 0,
    roundNumber: 1,
    shoe,
    discard: [],
    phase: 'round-in-progress',
    turnPlayerId: players[0]!.id,
    pendingAction: null,
    flip3Stack: [],
    dealQueue: null,
    lastRoundResult: null,
    winnerId: null,
    resolutionLog: [],
    ...overrides,
  };
}

describe('startFlipGame', () => {
  it('rejects fewer than two or more than five players', () => {
    expect(() => startFlipGame({ players: [{ id: 'a', name: 'A' }] })).toThrow();
    const sixPlayers = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(() => startFlipGame({ players: sixPlayers })).toThrow();
  });

  it('rejects duplicate player ids', () => {
    expect(() =>
      startFlipGame({ players: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A2' }] }),
    ).toThrow();
  });

  it('builds a 94-card shuffled shoe and picks a dealer in range', () => {
    const state = startFlipGame({
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      random: () => 0.5,
    });
    expect(state.shoe).toHaveLength(94);
    expect(state.discard).toHaveLength(0);
    expect(state.dealerIndex).toBeGreaterThanOrEqual(0);
    expect(state.dealerIndex).toBeLessThan(3);
    expect(state.phase).toBe('awaiting-round-start');
  });

  it('is deterministic for a given seeded random function', () => {
    const options = {
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    };
    let calls = 0;
    const seeded = () => {
      calls += 1;
      // simple deterministic sequence
      return ((calls * 2654435761) % 1000) / 1000;
    };
    calls = 0;
    const first = startFlipGame({ ...options, random: seeded });
    calls = 0;
    const second = startFlipGame({ ...options, random: seeded });
    expect(first.shoe.map((c) => c.id)).toEqual(second.shoe.map((c) => c.id));
    expect(first.dealerIndex).toBe(second.dealerIndex);
  });
});

describe('startRound', () => {
  it('deals one face-up card to each player starting to the dealer\'s left, dealer last', () => {
    const game = startFlipGame({
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      random: () => 0.1,
    });
    const cardForB = numberCard(1);
    const cardForC = numberCard(2);
    const cardForA = numberCard(3);
    const rigged: FlipGameState = { ...game, dealerIndex: 0, shoe: [cardForB, cardForC, cardForA] };

    const dealt = startRound(rigged, 'a', noRandom);

    expect(dealt.phase).toBe('round-in-progress');
    expect(dealt.roundNumber).toBe(1);
    expect(dealt.dealQueue).toBeNull();
    expect(dealt.players.find((p) => p.id === 'b')!.hand).toEqual([cardForB]);
    expect(dealt.players.find((p) => p.id === 'c')!.hand).toEqual([cardForC]);
    expect(dealt.players.find((p) => p.id === 'a')!.hand).toEqual([cardForA]);
    expect(dealt.turnPlayerId).toBe('b');
  });

  it('only the dealer can start the round', () => {
    const game = startFlipGame({
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      random: () => 0,
    });
    const rigged: FlipGameState = { ...game, dealerIndex: 0 };
    expect(() => startRound(rigged, 'b')).toThrow();
  });
});

describe('hit / freeze basics', () => {
  it('drawing a plain number adds it to the hand and passes the turn', () => {
    const players = [makePlayer('a'), makePlayer('b')];
    const state = baseState(players, [numberCard(4)]);

    const next = hit(state, 'a', noRandom);

    expect(next.players.find((p) => p.id === 'a')!.hand.map((c) => c.id)).toHaveLength(1);
    expect(next.turnPlayerId).toBe('b');
  });

  it('a duplicate number busts the hand, discards it, and passes the turn', () => {
    const players = [makePlayer('a', { hand: [numberCard(5)] }), makePlayer('b')];
    const state = baseState(players, [numberCard(5)]);

    const next = hit(state, 'a', noRandom);

    const a = next.players.find((p) => p.id === 'a')!;
    expect(a.status).toBe('busted');
    expect(a.hand).toEqual([]);
    expect(next.discard).toHaveLength(2);
    expect(next.turnPlayerId).toBe('b');
  });

  it('a modifier ends the turn without risk of busting', () => {
    const players = [makePlayer('a'), makePlayer('b')];
    const state = baseState(players, [modifierCard('+4')]);

    const next = hit(state, 'a', noRandom);

    expect(next.players.find((p) => p.id === 'a')!.status).toBe('active');
    expect(next.turnPlayerId).toBe('b');
  });

  it('voluntary freeze locks the hand and skips it in future turns', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
    const state = baseState(players, []);

    const afterFreeze = freeze(state, 'a', noRandom);
    expect(afterFreeze.players.find((p) => p.id === 'a')!.status).toBe('frozen');
    expect(afterFreeze.turnPlayerId).toBe('b');
  });

  it('a busted or frozen seat is skipped by turn advancement', () => {
    const players = [makePlayer('a'), makePlayer('b', { status: 'frozen' }), makePlayer('c')];
    const state = baseState(players, [numberCard(9)]);

    const next = hit(state, 'a', noRandom);

    expect(next.turnPlayerId).toBe('c');
  });
});

describe('Second Chance', () => {
  it('gains a Second Chance when none is held', () => {
    const players = [makePlayer('a'), makePlayer('b')];
    const state = baseState(players, [actionCard('second-chance')]);

    const next = hit(state, 'a', noRandom);

    expect(next.players.find((p) => p.id === 'a')!.hand).toHaveLength(1);
  });

  it('discards a second Second Chance instead of stacking', () => {
    const existing = actionCard('second-chance');
    const players = [makePlayer('a', { hand: [existing] }), makePlayer('b')];
    const drawn = actionCard('second-chance');
    const state = baseState(players, [drawn]);

    const next = hit(state, 'a', noRandom);

    expect(next.players.find((p) => p.id === 'a')!.hand).toEqual([existing]);
    expect(next.discard).toContainEqual(drawn);
  });

  it('saves a would-be bust: discards the duplicate and the Second Chance, turn ends normally', () => {
    const sc = actionCard('second-chance');
    const players = [makePlayer('a', { hand: [numberCard(5), sc] }), makePlayer('b')];
    const dup = numberCard(5);
    const state = baseState(players, [dup]);

    const next = hit(state, 'a', noRandom);

    const a = next.players.find((p) => p.id === 'a')!;
    expect(a.status).toBe('active');
    expect(a.hand).toHaveLength(1);
    expect(a.hand.some((c) => c.kind === 'action')).toBe(false);
    expect(next.discard).toEqual(expect.arrayContaining([dup, sc]));
    expect(next.turnPlayerId).toBe('b');
  });
});

describe('Flip 7', () => {
  it('ends the round immediately, scores the achiever with the +15 bonus, and scores everyone else as-is', () => {
    const players = [
      makePlayer('a', { hand: [0, 1, 2, 3, 4, 5].map(numberCard) }),
      makePlayer('b', { hand: [numberCard(9)] }),
      makePlayer('c', { status: 'busted' }),
    ];
    const state = baseState(players, [numberCard(6)]);

    const next = hit(state, 'a', noRandom);

    expect(next.phase).toBe('awaiting-round-start');
    expect(next.lastRoundResult!.flip7PlayerId).toBe('a');
    expect(next.lastRoundResult!.scores.a).toBe(0 + 1 + 2 + 3 + 4 + 5 + 6 + 15);
    expect(next.lastRoundResult!.scores.b).toBe(9);
    expect(next.lastRoundResult!.scores.c).toBe(0);
  });
});

describe('Freeze action card', () => {
  it('pauses for a target choice, then ends the flipper\'s turn regardless of target', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
    const state = baseState(players, [actionCard('freeze')]);

    const paused = hit(state, 'a', noRandom);
    expect(paused.pendingAction).toEqual({ kind: 'freeze' });
    expect(paused.turnPlayerId).toBe('a');

    const resolved = chooseFreezeTarget(paused, 'a', 'b', noRandom);
    expect(resolved.players.find((p) => p.id === 'b')!.status).toBe('frozen');
    expect(resolved.pendingAction).toBeNull();
    expect(resolved.turnPlayerId).toBe('c');
  });

  it('the flipper may target themselves', () => {
    const players = [makePlayer('a'), makePlayer('b')];
    const state = baseState(players, [actionCard('freeze')]);

    const paused = hit(state, 'a', noRandom);
    const resolved = chooseFreezeTarget(paused, 'a', 'a', noRandom);

    expect(resolved.players.find((p) => p.id === 'a')!.status).toBe('frozen');
    expect(resolved.turnPlayerId).toBe('b');
  });

  it('rejects a non-active target', () => {
    const players = [makePlayer('a'), makePlayer('b', { status: 'busted' })];
    const state = baseState(players, [actionCard('freeze')]);
    const paused = hit(state, 'a', noRandom);

    expect(() => chooseFreezeTarget(paused, 'a', 'b', noRandom)).toThrow();
  });

  it('if the flipper is the only eligible player, only self-targeting succeeds', () => {
    // a third, still-active player keeps the round alive past this freeze so
    // the assertion isn't confounded by the round ending and resetting status.
    const players = [makePlayer('a'), makePlayer('b', { status: 'frozen' }), makePlayer('c')];
    const state = baseState(players, [actionCard('freeze')]);
    const paused = hit(state, 'a', noRandom);

    expect(() => chooseFreezeTarget(paused, 'a', 'b', noRandom)).toThrow();
    const resolved = chooseFreezeTarget(paused, 'a', 'a', noRandom);
    expect(resolved.players.find((p) => p.id === 'a')!.status).toBe('frozen');
  });
});

describe('Flip 3 interruption table (#358)', () => {
  it('a bust during the Flip 3 stops the remaining cards from being dealt', () => {
    const players = [makePlayer('a'), makePlayer('b', { hand: [numberCard(5)] }), makePlayer('c')];
    const bustCard = numberCard(5);
    const spare1 = numberCard(7);
    const spare2 = numberCard(8);
    const state = baseState(players, [actionCard('flip3'), bustCard, spare1, spare2]);

    const paused = hit(state, 'a', noRandom);
    expect(paused.pendingAction).toEqual({ kind: 'flip3' });

    const resolved = chooseFlip3Target(paused, 'a', 'b', noRandom);

    const b = resolved.players.find((p) => p.id === 'b')!;
    expect(b.status).toBe('busted');
    expect(b.hand).toEqual([]);
    expect(resolved.flip3Stack).toEqual([]);
    // spare1/spare2 were never dealt
    expect(resolved.shoe.map((c) => c.id)).toEqual([spare1.id, spare2.id]);
    expect(resolved.turnPlayerId).toBe('c');
  });

  it('a Freeze drawn during the Flip 3 stops the remaining cards and pauses for its own target', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
    const freezeInFlip3 = actionCard('freeze');
    const spare1 = numberCard(7);
    const spare2 = numberCard(8);
    const state = baseState(players, [actionCard('flip3'), freezeInFlip3, spare1, spare2]);

    const paused = hit(state, 'a', noRandom);
    const afterTarget = chooseFlip3Target(paused, 'a', 'b', noRandom);

    expect(afterTarget.flip3Stack).toEqual([]);
    expect(afterTarget.pendingAction).toEqual({ kind: 'freeze' });
    expect(afterTarget.shoe.map((c) => c.id)).toEqual([spare1.id, spare2.id]);

    const resolved = chooseFreezeTarget(afterTarget, 'a', 'b', noRandom);
    expect(resolved.players.find((p) => p.id === 'b')!.status).toBe('frozen');
    expect(resolved.turnPlayerId).toBe('c');
  });

  it('a target reaching Flip 7 during the Flip 3 ends the round immediately, remaining cards not dealt', () => {
    const players = [
      makePlayer('a'),
      makePlayer('b', { hand: [0, 1, 2, 3, 4, 5].map(numberCard) }),
      makePlayer('c'),
    ];
    const flip7Card = numberCard(6);
    const spare1 = numberCard(9);
    const spare2 = numberCard(10);
    const state = baseState(players, [actionCard('flip3'), flip7Card, spare1, spare2]);

    const paused = hit(state, 'a', noRandom);
    const resolved = chooseFlip3Target(paused, 'a', 'b', noRandom);

    expect(resolved.phase).toBe('awaiting-round-start');
    expect(resolved.lastRoundResult!.flip7PlayerId).toBe('b');
    // the round-end shoe still holds the never-dealt spares
    expect(resolved.shoe.some((c) => c.id === spare1.id)).toBe(true);
    expect(resolved.shoe.some((c) => c.id === spare2.id)).toBe(true);
  });

  it('a nested Flip 3 resolves fully, then the outstanding flips continue', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
    const nestedFlip3 = actionCard('flip3');
    const forC1 = numberCard(1);
    const forC2 = numberCard(2);
    const forC3 = numberCard(3);
    const forB1 = numberCard(4);
    const forB2 = numberCard(5);
    const state = baseState(players, [actionCard('flip3'), nestedFlip3, forC1, forC2, forC3, forB1, forB2]);

    const pausedOuter = hit(state, 'a', noRandom);
    const pausedNested = chooseFlip3Target(pausedOuter, 'a', 'b', noRandom);
    expect(pausedNested.pendingAction).toEqual({ kind: 'flip3' });
    expect(pausedNested.flip3Stack).toEqual([{ targetId: 'b', remaining: 2 }]);

    const resolved = chooseFlip3Target(pausedNested, 'a', 'c', noRandom);

    expect(resolved.flip3Stack).toEqual([]);
    expect(resolved.pendingAction).toBeNull();
    const b = resolved.players.find((p) => p.id === 'b')!;
    const c = resolved.players.find((p) => p.id === 'c')!;
    expect(b.hand.map((card) => card.id).sort()).toEqual([forB1.id, forB2.id].sort());
    expect(c.hand.map((card) => card.id).sort()).toEqual([forC1.id, forC2.id, forC3.id].sort());
    expect(resolved.turnPlayerId).toBe('b');
  });

  it('a Second Chance save during the Flip 3 does not stop the remaining cards', () => {
    const sc = actionCard('second-chance');
    const players = [makePlayer('a'), makePlayer('b', { hand: [numberCard(5), sc] }), makePlayer('c')];
    const dup = numberCard(5);
    const safe1 = numberCard(8);
    const safe2 = modifierCard('+2');
    const state = baseState(players, [actionCard('flip3'), dup, safe1, safe2]);

    const paused = hit(state, 'a', noRandom);
    const resolved = chooseFlip3Target(paused, 'a', 'b', noRandom);

    const b = resolved.players.find((p) => p.id === 'b')!;
    expect(b.status).toBe('active');
    expect(b.hand.map((c) => c.id).sort()).toEqual([players[1]!.hand[0]!.id, safe1.id, safe2.id].sort());
    expect(b.hand.some((c) => c.kind === 'action')).toBe(false);
    expect(resolved.flip3Stack).toEqual([]);
    expect(resolved.shoe).toEqual([]);
  });
});

describe('winning', () => {
  it('ends the game for the highest total once any player crosses 200', () => {
    const players = [
      makePlayer('a', { hand: [numberCard(12)], totalScore: 190 }),
      makePlayer('b', { hand: [numberCard(3)], totalScore: 50 }),
    ];
    const state = baseState(players, []);

    const afterA = freeze(state, 'a', noRandom);
    const afterB = freeze(afterA, 'b', noRandom);

    expect(afterB.phase).toBe('game-over');
    expect(afterB.winnerId).toBe('a');
    expect(afterB.players.find((p) => p.id === 'a')!.totalScore).toBe(202);
    expect(afterB.players.find((p) => p.id === 'b')!.totalScore).toBe(53);
  });

  it('breaks a tie at 200+ by the highest score in the final round', () => {
    const players = [
      makePlayer('a', { hand: [numberCard(10)], totalScore: 190 }),
      makePlayer('b', { hand: [numberCard(5)], totalScore: 195 }),
    ];
    const state = baseState(players, []);

    const afterA = freeze(state, 'a', noRandom);
    const afterB = freeze(afterA, 'b', noRandom);

    expect(afterB.phase).toBe('game-over');
    expect(afterB.winnerId).toBe('a');
    expect(afterB.players.find((p) => p.id === 'a')!.totalScore).toBe(200);
    expect(afterB.players.find((p) => p.id === 'b')!.totalScore).toBe(200);
  });

  it('plays another full round when still tied after the round-score tiebreak', () => {
    const players = [
      makePlayer('a', { hand: [numberCard(10)], totalScore: 190 }),
      makePlayer('b', { hand: [numberCard(10)], totalScore: 190 }),
    ];
    const state = baseState(players, [], { dealerIndex: 0 });

    const afterA = freeze(state, 'a', noRandom);
    const afterB = freeze(afterA, 'b', noRandom);

    expect(afterB.winnerId).toBeNull();
    expect(afterB.phase).toBe('awaiting-round-start');
    expect(afterB.dealerIndex).toBe(1);
    expect(afterB.players.find((p) => p.id === 'a')!.totalScore).toBe(200);
    expect(afterB.players.find((p) => p.id === 'b')!.totalScore).toBe(200);
    // the persistent shoe/discard carry over — this round's hands moved to discard
    expect(afterB.discard).toHaveLength(2);
  });
});

describe('validation guards', () => {
  it('startRound refuses to run outside awaiting-round-start', () => {
    const players = [makePlayer('a'), makePlayer('b')];
    const state = baseState(players, []);
    expect(state.phase).toBe('round-in-progress');
    expect(() => startRound(state, 'a', noRandom)).toThrow();
  });

  it('chooseFreezeTarget/chooseFlip3Target refuse to run without a pending action', () => {
    const players = [makePlayer('a'), makePlayer('b')];
    const state = baseState(players, []);
    expect(() => chooseFreezeTarget(state, 'a', 'b', noRandom)).toThrow();
    expect(() => chooseFlip3Target(state, 'a', 'b', noRandom)).toThrow();
  });

  it('a round can end during the opening deal itself, if it leaves nobody active', () => {
    const game = startFlipGame({ players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], random: () => 0 });
    const rigged: FlipGameState = {
      ...game,
      dealerIndex: 0,
      shoe: [actionCard('freeze'), actionCard('freeze')],
    };

    const pausedForB = startRound(rigged, 'a', noRandom);
    expect(pausedForB.pendingAction).toEqual({ kind: 'freeze' });
    expect(pausedForB.turnPlayerId).toBe('b');

    const pausedForA = chooseFreezeTarget(pausedForB, 'b', 'b', noRandom);
    expect(pausedForA.pendingAction).toEqual({ kind: 'freeze' });
    expect(pausedForA.turnPlayerId).toBe('a');

    const settled = chooseFreezeTarget(pausedForA, 'a', 'a', noRandom);
    expect(settled.phase).toBe('awaiting-round-start');
    expect(settled.turnPlayerId).toBeNull();
    expect(settled.lastRoundResult).not.toBeNull();
  });
});

describe('resolutionLog (#363 narration support)', () => {
  it('resets at the start of every call and logs a plain hit', () => {
    const players = [makePlayer('a'), makePlayer('b')];
    const card = numberCard(4);
    const state = baseState(players, [card], { resolutionLog: [{ targetId: 'x', card, effect: 'number-added', context: 'hit' }] });

    const next = hit(state, 'a', noRandom);

    expect(next.resolutionLog).toEqual([{ targetId: 'a', card, effect: 'number-added', context: 'hit' }]);
  });

  it('a bust stop condition explains itself as the last logged event', () => {
    const players = [makePlayer('a'), makePlayer('b', { hand: [numberCard(5)] }), makePlayer('c')];
    const bustCard = numberCard(5);
    const state = baseState(players, [actionCard('flip3'), bustCard]);

    const paused = hit(state, 'a', noRandom);
    const resolved = chooseFlip3Target(paused, 'a', 'b', noRandom);

    const last = resolved.resolutionLog[resolved.resolutionLog.length - 1]!;
    expect(last.effect).toBe('number-busted');
    expect(last.targetId).toBe('b');
  });

  it('a Second Chance save logs "number-saved" and the deal visibly continues past it', () => {
    const sc = actionCard('second-chance');
    const players = [makePlayer('a'), makePlayer('b', { hand: [numberCard(5), sc] }), makePlayer('c')];
    const dup = numberCard(5);
    const safe = numberCard(8);
    const safe2 = modifierCard('+2');
    const state = baseState(players, [actionCard('flip3'), dup, safe, safe2]);

    const paused = hit(state, 'a', noRandom);
    const resolved = chooseFlip3Target(paused, 'a', 'b', noRandom);

    const effects = resolved.resolutionLog.map((event) => event.effect);
    expect(effects).toContain('number-saved');
    // the save is not the last event — dealing continued afterward
    expect(effects[effects.length - 1]).not.toBe('number-saved');
    expect(effects.filter((e) => e === 'number-added' || e === 'modifier-added')).toHaveLength(2);
  });

  it('a nested Flip 3 is distinguishable in the log by target and context', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
    const nestedFlip3 = actionCard('flip3');
    const forC1 = numberCard(1);
    const forC2 = numberCard(2);
    const forC3 = numberCard(3);
    const forB1 = numberCard(4);
    const forB2 = numberCard(5);
    const state = baseState(players, [actionCard('flip3'), nestedFlip3, forC1, forC2, forC3, forB1, forB2]);

    const pausedOuter = hit(state, 'a', noRandom);
    const pausedNested = chooseFlip3Target(pausedOuter, 'a', 'b', noRandom);
    const resolved = chooseFlip3Target(pausedNested, 'a', 'c', noRandom);

    // the first call's log only shows what happened up to the nested pause
    expect(pausedNested.resolutionLog.map((e) => e.effect)).toEqual(['flip3-drawn']);
    expect(pausedNested.resolutionLog[0]!.targetId).toBe('b');
    // the second call resumes: the nested target's 3 cards, then the outer target's remaining 2
    expect(resolved.resolutionLog).toEqual([
      { targetId: 'c', card: forC1, effect: 'number-added', context: 'flip3' },
      { targetId: 'c', card: forC2, effect: 'number-added', context: 'flip3' },
      { targetId: 'c', card: forC3, effect: 'number-added', context: 'flip3' },
      { targetId: 'b', card: forB1, effect: 'number-added', context: 'flip3' },
      { targetId: 'b', card: forB2, effect: 'number-added', context: 'flip3' },
    ]);
  });

  it('the opening deal logs each dealt card with context "deal"', () => {
    const game = startFlipGame({ players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], random: () => 0 });
    const cardForB = numberCard(1);
    const cardForA = numberCard(2);
    const rigged: FlipGameState = { ...game, dealerIndex: 0, shoe: [cardForB, cardForA] };

    const dealt = startRound(rigged, 'a', noRandom);

    expect(dealt.resolutionLog).toEqual([
      { targetId: 'b', card: cardForB, effect: 'number-added', context: 'deal' },
      { targetId: 'a', card: cardForA, effect: 'number-added', context: 'deal' },
    ]);
  });
});
