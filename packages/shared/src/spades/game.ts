import { createStandardShoe, dealCards, shuffleCards, type CardInstance } from '../cards/card-engine.js';
import { assignSpadesSeats } from './seating.js';
import { determineWinner, scoreHand } from './scoring.js';
import {
  getLegalPlays,
  isValidBid,
  nextSeat,
  playBreaksSpades,
  resolveTrick,
  validatePlay,
} from './rules.js';
import {
  SPADES_SEATS,
  type PartialSeatMap,
  type SeatMap,
  type SpadesBid,
  type SpadesGameState,
  type SpadesPlayerView,
  type SpadesSeat,
  type StartSpadesGameOptions,
  type TeamScore,
} from './types.js';

const emptyScores = (): Record<'north-south' | 'east-west', TeamScore> => ({
  'north-south': { score: 0, bags: 0 },
  'east-west': { score: 0, bags: 0 },
});

const emptyTricks = (): SeatMap<number> => ({ north: 0, east: 0, south: 0, west: 0 });

function seatOrderAfter(seat: SpadesSeat): SpadesSeat[] {
  const order: SpadesSeat[] = [];
  let cursor = nextSeat(seat);
  for (let index = 0; index < 4; index += 1) {
    order.push(cursor);
    cursor = nextSeat(cursor);
  }
  return order;
}

function dealHands(dealer: SpadesSeat, random: () => number): SeatMap<readonly CardInstance[]> {
  const deck = shuffleCards(createStandardShoe({ decks: 1, idPrefix: 'spades' }), random);
  const dealt = dealCards(deck, 4, 13);
  const order = seatOrderAfter(dealer);
  return {
    north: dealt.hands[order.indexOf('north')]!,
    east: dealt.hands[order.indexOf('east')]!,
    south: dealt.hands[order.indexOf('south')]!,
    west: dealt.hands[order.indexOf('west')]!,
  };
}

function beginHand(
  state: Pick<SpadesGameState, 'targetScore' | 'players' | 'scores'>,
  dealer: SpadesSeat,
  handNumber: number,
  random: () => number,
): SpadesGameState {
  const first = nextSeat(dealer);
  return {
    phase: 'blind-nil',
    targetScore: state.targetScore,
    handNumber,
    players: state.players,
    dealer,
    currentSeat: null,
    handsRevealed: false,
    hands: dealHands(dealer, random),
    blindNilChoices: {},
    bids: {},
    currentTrick: { leader: first, plays: [] },
    completedTricks: [],
    tricksWon: emptyTricks(),
    scores: state.scores,
    spadesBroken: false,
    winner: null,
  };
}

export function startSpadesGame(options: StartSpadesGameOptions): SpadesGameState {
  const random = options.random ?? Math.random;
  const players = assignSpadesSeats({
    humans: options.humans,
    botDifficulties: options.botDifficulties,
    random,
  });
  const dealer = SPADES_SEATS[Math.min(Math.floor(random() * 4), 3)]!;
  return beginHand(
    { targetScore: options.targetScore, players, scores: emptyScores() },
    dealer,
    1,
    random,
  );
}

function firstSeatWithoutBid(dealer: SpadesSeat, bids: PartialSeatMap<SpadesBid>): SpadesSeat | null {
  return seatOrderAfter(dealer).find((seat) => bids[seat] === undefined) ?? null;
}

export function submitBlindNilChoice(
  state: SpadesGameState,
  seat: SpadesSeat,
  blindNil: boolean,
): SpadesGameState {
  if (state.phase !== 'blind-nil') throw new Error('blind-nil choices are closed');
  if (state.blindNilChoices[seat] !== undefined) throw new Error('blind-nil choice already locked');

  const blindNilChoices = { ...state.blindNilChoices, [seat]: blindNil };
  const allLocked = SPADES_SEATS.every((candidate) => blindNilChoices[candidate] !== undefined);
  if (!allLocked) return { ...state, blindNilChoices };

  const bids: PartialSeatMap<SpadesBid> = {};
  for (const candidate of SPADES_SEATS) {
    if (blindNilChoices[candidate]) bids[candidate] = { kind: 'blind-nil' };
  }
  const firstBidder = firstSeatWithoutBid(state.dealer, bids);
  return {
    ...state,
    phase: firstBidder ? 'bidding' : 'playing',
    currentSeat: firstBidder ?? nextSeat(state.dealer),
    handsRevealed: true,
    blindNilChoices,
    bids,
  };
}

export function submitBid(
  state: SpadesGameState,
  seat: SpadesSeat,
  bid: Exclude<SpadesBid, { kind: 'blind-nil' }>,
): SpadesGameState {
  if (state.phase !== 'bidding') throw new Error('the game is not accepting bids');
  if (state.currentSeat !== seat) throw new Error('it is not this seat\'s turn to bid');
  if (!isValidBid(bid)) throw new RangeError('invalid Spades bid');
  if (state.bids[seat]) throw new Error('this seat already has a bid');

  const bids = { ...state.bids, [seat]: bid };
  const nextBidder = firstSeatWithoutBid(state.dealer, bids);
  if (nextBidder) return { ...state, bids, currentSeat: nextBidder };

  const leader = nextSeat(state.dealer);
  return {
    ...state,
    phase: 'playing',
    bids,
    currentSeat: leader,
    currentTrick: { leader, plays: [] },
  };
}

function completeHand(state: SpadesGameState, random: () => number): SpadesGameState {
  const completeBids = state.bids as SeatMap<SpadesBid>;
  const northSouth = scoreHand({
    team: 'north-south',
    bids: completeBids,
    tricksWon: state.tricksWon,
    previous: state.scores['north-south'],
  });
  const eastWest = scoreHand({
    team: 'east-west',
    bids: completeBids,
    tricksWon: state.tricksWon,
    previous: state.scores['east-west'],
  });
  const scores = {
    'north-south': { score: northSouth.score, bags: northSouth.bags },
    'east-west': { score: eastWest.score, bags: eastWest.bags },
  };
  const winner = determineWinner(scores, state.targetScore);
  if (winner && winner !== 'tie') {
    return { ...state, phase: 'finished', currentSeat: null, scores, winner };
  }
  return beginHand(
    { targetScore: state.targetScore, players: state.players, scores },
    nextSeat(state.dealer),
    state.handNumber + 1,
    random,
  );
}

export function playCard(
  state: SpadesGameState,
  seat: SpadesSeat,
  cardId: string,
  random: () => number = Math.random,
): SpadesGameState {
  if (state.phase !== 'playing') throw new Error('the game is not accepting card plays');
  if (state.currentSeat !== seat) throw new Error('it is not this seat\'s turn to play');
  const hand = state.hands[seat];
  const card = hand.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error('card is not in this seat\'s hand');
  const validation = validatePlay(hand, card, state.currentTrick, state.spadesBroken);
  if (!validation.legal) throw new Error(validation.reason);

  const currentTrick = {
    ...state.currentTrick,
    plays: [...state.currentTrick.plays, { seat, card }],
  };
  const hands = { ...state.hands, [seat]: hand.filter((candidate) => candidate.id !== cardId) };
  const spadesBroken = state.spadesBroken || playBreaksSpades({ seat, card }, state.currentTrick);

  if (currentTrick.plays.length < 4) {
    return { ...state, hands, currentTrick, spadesBroken, currentSeat: nextSeat(seat) };
  }

  const completed = resolveTrick(currentTrick);
  const tricksWon = {
    ...state.tricksWon,
    [completed.winner]: state.tricksWon[completed.winner] + 1,
  };
  const afterTrick = {
    ...state,
    hands,
    tricksWon,
    spadesBroken,
    currentSeat: completed.winner,
    currentTrick: { leader: completed.winner, plays: [] },
    completedTricks: [...state.completedTricks, completed],
  };
  const noCardsRemain = SPADES_SEATS.every((candidate) => hands[candidate].length === 0);
  return noCardsRemain ? completeHand(afterTrick, random) : afterTrick;
}

export function getLegalCardsForCurrentSeat(state: SpadesGameState): readonly CardInstance[] {
  if (state.phase !== 'playing' || !state.currentSeat) return [];
  return getLegalPlays(
    state.hands[state.currentSeat],
    state.currentTrick,
    state.spadesBroken,
  );
}

export function buildSpadesPlayerView(
  state: SpadesGameState,
  viewingSeat: SpadesSeat,
): SpadesPlayerView {
  const bids = state.phase === 'blind-nil' ? {} : state.bids;
  return {
    phase: state.phase,
    targetScore: state.targetScore,
    handNumber: state.handNumber,
    players: state.players,
    dealer: state.dealer,
    currentSeat: state.currentSeat,
    hand: state.handsRevealed ? state.hands[viewingSeat] : [],
    opponentHandCounts: {
      north: viewingSeat === 'north' ? 0 : state.hands.north.length,
      east: viewingSeat === 'east' ? 0 : state.hands.east.length,
      south: viewingSeat === 'south' ? 0 : state.hands.south.length,
      west: viewingSeat === 'west' ? 0 : state.hands.west.length,
    },
    blindNilChoicesMade: Object.keys(state.blindNilChoices).length,
    bids,
    currentTrick: state.currentTrick,
    completedTricks: state.completedTricks,
    tricksWon: state.tricksWon,
    scores: state.scores,
    spadesBroken: state.spadesBroken,
    winner: state.winner,
  };
}
