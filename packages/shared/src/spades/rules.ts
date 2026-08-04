import type { CardInstance, StandardRank, StandardSuit } from '../cards/card-engine.js';
import {
  SPADES_SEATS,
  type CompletedTrick,
  type LegalPlayResult,
  type SpadesBid,
  type SpadesSeat,
  type SpadesTeam,
  type TrickPlay,
  type TrickState,
} from './types.js';

const RANK_STRENGTH: Readonly<Record<StandardRank, number>> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  jack: 11,
  queen: 12,
  king: 13,
  ace: 14,
};

export function nextSeat(seat: SpadesSeat): SpadesSeat {
  const index = SPADES_SEATS.indexOf(seat);
  return SPADES_SEATS[(index + 1) % SPADES_SEATS.length]!;
}

export function teamForSeat(seat: SpadesSeat): SpadesTeam {
  return seat === 'north' || seat === 'south' ? 'north-south' : 'east-west';
}

export function seatsForTeam(team: SpadesTeam): readonly [SpadesSeat, SpadesSeat] {
  return team === 'north-south' ? ['north', 'south'] : ['east', 'west'];
}

export function isValidBid(bid: SpadesBid): boolean {
  if (bid.kind !== 'normal') return true;
  return Number.isInteger(bid.tricks) && bid.tricks >= 1 && bid.tricks <= 13;
}

function containsCard(hand: readonly CardInstance[], card: CardInstance): boolean {
  return hand.some((candidate) => candidate.id === card.id);
}

export function validatePlay(
  hand: readonly CardInstance[],
  card: CardInstance,
  trick: TrickState,
  spadesBroken: boolean,
): LegalPlayResult {
  if (!containsCard(hand, card)) return { legal: false, reason: 'card-not-in-hand' };

  const leadSuit = trick.plays[0]?.card.suit;
  if (leadSuit) {
    const canFollow = hand.some((candidate) => candidate.suit === leadSuit);
    if (canFollow && card.suit !== leadSuit) {
      return { legal: false, reason: 'must-follow-suit' };
    }
    return { legal: true };
  }

  if (card.suit === 'spades' && !spadesBroken) {
    const hasNonSpade = hand.some((candidate) => candidate.suit !== 'spades');
    if (hasNonSpade) return { legal: false, reason: 'spades-not-broken' };
  }

  return { legal: true };
}

export function getLegalPlays(
  hand: readonly CardInstance[],
  trick: TrickState,
  spadesBroken: boolean,
): CardInstance[] {
  return hand.filter((card) => validatePlay(hand, card, trick, spadesBroken).legal);
}

export function playBreaksSpades(play: TrickPlay, trick: TrickState): boolean {
  const leadSuit = trick.plays[0]?.card.suit;
  return play.card.suit === 'spades' && leadSuit !== undefined && leadSuit !== 'spades';
}

function beats(
  challenger: CardInstance,
  incumbent: CardInstance,
  leadSuit: StandardSuit,
): boolean {
  if (challenger.suit === incumbent.suit) {
    return RANK_STRENGTH[challenger.rank] > RANK_STRENGTH[incumbent.rank];
  }
  if (challenger.suit === 'spades') return true;
  if (incumbent.suit === 'spades') return false;
  return challenger.suit === leadSuit && incumbent.suit !== leadSuit;
}

export function resolveTrick(trick: TrickState): CompletedTrick {
  if (trick.plays.length !== 4) {
    throw new RangeError('a completed Spades trick must contain exactly four plays');
  }
  if (trick.plays[0]?.seat !== trick.leader) {
    throw new Error('the first play must belong to the trick leader');
  }

  for (let index = 0; index < trick.plays.length; index += 1) {
    const expected = SPADES_SEATS[(SPADES_SEATS.indexOf(trick.leader) + index) % 4];
    if (trick.plays[index]?.seat !== expected) {
      throw new Error('trick plays must follow clockwise seat order');
    }
  }

  const leadSuit = trick.plays[0]!.card.suit;
  const winningPlay = trick.plays.slice(1).reduce(
    (winner, play) => (beats(play.card, winner.card, leadSuit) ? play : winner),
    trick.plays[0]!,
  );

  return { winner: winningPlay.seat, leadSuit, plays: trick.plays };
}

export function currentTrickWinner(trick: TrickState): SpadesSeat | null {
  if (trick.plays.length === 0) return null;
  const leadSuit = trick.plays[0]!.card.suit;
  return trick.plays.slice(1).reduce(
    (winner, play) => (beats(play.card, winner.card, leadSuit) ? play : winner),
    trick.plays[0]!,
  ).seat;
}

export function rankStrength(rank: StandardRank): number {
  return RANK_STRENGTH[rank];
}
