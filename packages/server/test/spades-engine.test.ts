import { describe, expect, it } from 'vitest';
import {
  createStandardShoe,
  dealCards,
  type CardInstance,
  type StandardRank,
  type StandardSuit,
} from '@tabletop/shared';
import {
  assignSpadesSeats,
  buildSpadesPlayerView,
  chooseBotBid,
  chooseBotBlindNil,
  chooseBotCard,
  determineWinner,
  generateThemedNames,
  getLegalCardsForCurrentSeat,
  getLegalPlays,
  isValidBid,
  nextSeat,
  playBreaksSpades,
  resolveTrick,
  scoreHand,
  startSpadesGame,
  submitBid,
  submitBlindNilChoice,
  playCard,
  teamForSeat,
  validatePlay,
  type SpadesBid,
  type SpadesSeat,
} from '@tabletop/shared';

let sequence = 0;
const card = (suit: StandardSuit, rank: StandardRank): CardInstance => ({
  id: `test:${sequence++}:${suit}:${rank}`,
  deckIndex: 0,
  suit,
  rank,
});

const bids = (entries: Partial<Record<SpadesSeat, SpadesBid>>) => ({
  north: { kind: 'normal', tricks: 3 } as SpadesBid,
  east: { kind: 'normal', tricks: 3 } as SpadesBid,
  south: { kind: 'normal', tricks: 3 } as SpadesBid,
  west: { kind: 'normal', tricks: 3 } as SpadesBid,
  ...entries,
});

const tricks = (entries: Partial<Record<SpadesSeat, number>>) => ({
  north: 0,
  east: 0,
  south: 0,
  west: 0,
  ...entries,
});

describe('seat and bid rules', () => {
  it('rotates seats clockwise and preserves partnerships', () => {
    expect(nextSeat('north')).toBe('east');
    expect(nextSeat('west')).toBe('north');
    expect(teamForSeat('south')).toBe('north-south');
    expect(teamForSeat('west')).toBe('east-west');
  });

  it('accepts standard, nil, and blind-nil bids only in range', () => {
    expect(isValidBid({ kind: 'normal', tricks: 1 })).toBe(true);
    expect(isValidBid({ kind: 'normal', tricks: 13 })).toBe(true);
    expect(isValidBid({ kind: 'normal', tricks: 0 })).toBe(false);
    expect(isValidBid({ kind: 'normal', tricks: 14 })).toBe(false);
    expect(isValidBid({ kind: 'nil' })).toBe(true);
    expect(isValidBid({ kind: 'blind-nil' })).toBe(true);
  });
});

describe('reusable card integration', () => {
  it('deals one complete standard deck into four 13-card hands', () => {
    const deck = createStandardShoe({ decks: 1, idPrefix: 'spades' });
    const result = dealCards(deck, 4, 13);
    expect(deck).toHaveLength(52);
    expect(result.hands.map((hand) => hand.length)).toEqual([13, 13, 13, 13]);
    expect(result.remainder).toEqual([]);
    expect(new Set(deck.map((item) => item.id)).size).toBe(52);
  });
});

describe('legal card play', () => {
  it('requires following suit', () => {
    const club = card('clubs', '2');
    const heart = card('hearts', 'ace');
    const lead = { leader: 'north' as const, plays: [{ seat: 'north' as const, card: card('clubs', 'king') }] };
    expect(validatePlay([club, heart], heart, lead, false)).toEqual({ legal: false, reason: 'must-follow-suit' });
    expect(getLegalPlays([club, heart], lead, false)).toEqual([club]);
  });

  it('allows a discard when the player cannot follow suit', () => {
    const spade = card('spades', '2');
    const lead = { leader: 'north' as const, plays: [{ seat: 'north' as const, card: card('clubs', 'king') }] };
    expect(validatePlay([spade], spade, lead, false)).toEqual({ legal: true });
    expect(playBreaksSpades({ seat: 'east', card: spade }, lead)).toBe(true);
  });

  it('blocks leading spades before they break unless only spades remain', () => {
    const spade = card('spades', 'ace');
    const heart = card('hearts', '2');
    const empty = { leader: 'north' as const, plays: [] };
    expect(validatePlay([spade, heart], spade, empty, false)).toEqual({ legal: false, reason: 'spades-not-broken' });
    expect(validatePlay([spade], spade, empty, false)).toEqual({ legal: true });
    expect(playBreaksSpades({ seat: 'north', card: spade }, empty)).toBe(true);
  });
});

describe('trick resolution', () => {
  it('awards the trick to the highest card of the led suit without trump', () => {
    const result = resolveTrick({
      leader: 'north',
      plays: [
        { seat: 'north', card: card('hearts', '10') },
        { seat: 'east', card: card('hearts', 'ace') },
        { seat: 'south', card: card('diamonds', 'ace') },
        { seat: 'west', card: card('hearts', 'king') },
      ],
    });
    expect(result.winner).toBe('east');
  });

  it('awards the trick to the highest spade', () => {
    const result = resolveTrick({
      leader: 'east',
      plays: [
        { seat: 'east', card: card('clubs', 'ace') },
        { seat: 'south', card: card('spades', '3') },
        { seat: 'west', card: card('spades', 'king') },
        { seat: 'north', card: card('clubs', 'king') },
      ],
    });
    expect(result.winner).toBe('west');
  });

  it('rejects incomplete or out-of-order tricks', () => {
    expect(() => resolveTrick({ leader: 'north', plays: [] })).toThrow(/exactly four/);
    expect(() => resolveTrick({
      leader: 'north',
      plays: [
        { seat: 'north', card: card('clubs', '2') },
        { seat: 'south', card: card('clubs', '3') },
        { seat: 'east', card: card('clubs', '4') },
        { seat: 'west', card: card('clubs', '5') },
      ],
    })).toThrow(/clockwise/);
  });
});

describe('scoring', () => {
  it('scores a made contract and overtrick bags', () => {
    const result = scoreHand({
      team: 'north-south',
      bids: bids({ north: { kind: 'normal', tricks: 3 }, south: { kind: 'normal', tricks: 2 } }),
      tricksWon: tricks({ north: 3, south: 3 }),
      previous: { score: 100, bags: 2 },
    });
    expect(result).toMatchObject({ score: 151, bags: 3, handPoints: 51, bagPoints: 1, contractMade: true });
  });

  it('penalizes a missed contract', () => {
    const result = scoreHand({
      team: 'north-south',
      bids: bids({ north: { kind: 'normal', tricks: 4 }, south: { kind: 'normal', tricks: 3 } }),
      tricksWon: tricks({ north: 3, south: 3 }),
      previous: { score: 25, bags: 0 },
    });
    expect(result).toMatchObject({ score: -45, handPoints: -70, bags: 0, contractMade: false });
  });

  it('scores successful and failed nil bids separately from the contract', () => {
    const success = scoreHand({
      team: 'north-south',
      bids: bids({ north: { kind: 'nil' }, south: { kind: 'normal', tricks: 4 } }),
      tricksWon: tricks({ north: 0, south: 5 }),
      previous: { score: 0, bags: 0 },
    });
    expect(success).toMatchObject({ score: 141, nilPoints: 100, contractPoints: 40, bagPoints: 1 });

    const failedBlind = scoreHand({
      team: 'north-south',
      bids: bids({ north: { kind: 'blind-nil' }, south: { kind: 'normal', tricks: 4 } }),
      tricksWon: tricks({ north: 1, south: 4 }),
      previous: { score: 0, bags: 0 },
    });
    expect(failedBlind).toMatchObject({ score: -159, nilPoints: -200, contractPoints: 40, bagPoints: 1 });
  });

  it('applies the 10-bag penalty and carries the remainder', () => {
    const result = scoreHand({
      team: 'north-south',
      bids: bids({ north: { kind: 'normal', tricks: 2 }, south: { kind: 'normal', tricks: 2 } }),
      tricksWon: tricks({ north: 3, south: 3 }),
      previous: { score: 300, bags: 9 },
    });
    expect(result).toMatchObject({ score: 242, bags: 1, handPoints: -58, bagPenalty: -100 });
  });

  it('waits for the target and resolves ties with another hand', () => {
    expect(determineWinner({ 'north-south': { score: 249, bags: 0 }, 'east-west': { score: 200, bags: 0 } }, 250)).toBeNull();
    expect(determineWinner({ 'north-south': { score: 260, bags: 0 }, 'east-west': { score: 250, bags: 0 } }, 250)).toBe('north-south');
    expect(determineWinner({ 'north-south': { score: 260, bags: 0 }, 'east-west': { score: 260, bags: 0 } }, 250)).toBe('tie');
  });
});

describe('bot and name foundations', () => {
  it('generates unique themed names without colliding with humans', () => {
    const names = generateThemedNames(3, ['Ari'], () => 0);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    expect(names).not.toContain('Ari');
  });

  it('supports independent easy, normal, and hard bids', () => {
    const hand = [
      card('spades', 'ace'), card('spades', 'king'), card('spades', 'queen'),
      card('hearts', 'ace'), card('diamonds', 'ace'), card('clubs', 'ace'),
    ];
    expect(chooseBotBid({ hand, difficulty: 'easy', random: () => 0 })).toEqual({ kind: 'normal', tricks: 1 });
    expect(chooseBotBid({ hand, difficulty: 'normal' }).kind).toBe('normal');
    expect(chooseBotBid({ hand, difficulty: 'hard' }).kind).toBe('normal');
  });

  it('makes blind-nil decisions without receiving a hand', () => {
    expect(chooseBotBlindNil({
      difficulty: 'hard',
      teamScore: 100,
      opponentScore: 350,
      targetScore: 500,
      random: () => 0,
    })).toBe(true);
    expect(chooseBotBlindNil({
      difficulty: 'normal',
      teamScore: 300,
      opponentScore: 310,
      targetScore: 500,
      random: () => 0,
    })).toBe(false);
  });

  it('never lets any bot difficulty choose an illegal card', () => {
    const club = card('clubs', '2');
    const spade = card('spades', 'ace');
    const context = {
      hand: [club, spade],
      trick: { leader: 'north' as const, plays: [{ seat: 'north' as const, card: card('clubs', 'king') }] },
      spadesBroken: false,
    };
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      expect(chooseBotCard({ ...context, difficulty, random: () => 0 })).toBe(club);
    }
  });

  it('automatically assigns four seats and independent bot difficulties', () => {
    const seated = assignSpadesSeats({
      humans: [{ id: 'human:ben', name: 'Ben' }],
      botDifficulties: ['easy', 'hard', 'normal'],
      random: () => 0,
    });
    expect(seated).toHaveLength(4);
    expect(new Set(seated.map((player) => player.seat)).size).toBe(4);
    expect(seated.filter((player) => player.isBot).map((player) => player.difficulty).sort()).toEqual(['easy', 'hard', 'normal']);
    expect(seated.find((player) => player.id === 'human:ben')?.difficulty).toBeUndefined();
  });
});

describe('headless game state machine', () => {
  const start = () => startSpadesGame({
    humans: [{ id: 'human:ben', name: 'Ben' }],
    botDifficulties: ['easy', 'normal', 'hard'],
    targetScore: 250,
    random: () => 0.25,
  });

  it('keeps every hand private until all blind-nil choices are locked', () => {
    let state = start();
    expect(state.phase).toBe('blind-nil');
    expect(buildSpadesPlayerView(state, 'north').hand).toEqual([]);
    state = submitBlindNilChoice(state, 'north', true);
    expect(state.phase).toBe('blind-nil');
    expect(buildSpadesPlayerView(state, 'east').bids).toEqual({});
    state = submitBlindNilChoice(state, 'east', false);
    state = submitBlindNilChoice(state, 'south', false);
    state = submitBlindNilChoice(state, 'west', false);
    expect(state.phase).toBe('bidding');
    expect(state.bids.north).toEqual({ kind: 'blind-nil' });
    expect(buildSpadesPlayerView(state, 'north').hand).toHaveLength(13);
    expect(buildSpadesPlayerView(state, 'north').opponentHandCounts.east).toBe(13);
  });

  it('transitions from private choices through clockwise bidding into play', () => {
    let state = start();
    for (const seat of ['north', 'east', 'south', 'west'] as const) {
      state = submitBlindNilChoice(state, seat, false);
    }
    expect(state.phase).toBe('bidding');
    for (let index = 0; index < 4; index += 1) {
      const seat = state.currentSeat!;
      state = submitBid(state, seat, { kind: 'normal', tricks: 2 });
    }
    expect(state.phase).toBe('playing');
    expect(state.currentSeat).toBe(state.currentTrick.leader);
    expect(getLegalCardsForCurrentSeat(state).length).toBeGreaterThan(0);
  });

  it('plays and scores a complete hand without exposing illegal choices', () => {
    let state = start();
    for (const seat of ['north', 'east', 'south', 'west'] as const) {
      state = submitBlindNilChoice(state, seat, false);
    }
    while (state.phase === 'bidding') {
      state = submitBid(state, state.currentSeat!, { kind: 'normal', tricks: 1 });
    }
    const startingHandNumber = state.handNumber;
    let plays = 0;
    while (state.phase === 'playing' && plays < 52) {
      const legal = getLegalCardsForCurrentSeat(state);
      expect(legal.length).toBeGreaterThan(0);
      state = playCard(state, state.currentSeat!, legal[0]!.id, () => 0.75);
      plays += 1;
    }
    expect(plays).toBe(52);
    expect(state.handNumber === startingHandNumber + 1 || state.phase === 'finished').toBe(true);
    expect(state.scores['north-south'].score !== 0 || state.scores['east-west'].score !== 0).toBe(true);
  });
});
