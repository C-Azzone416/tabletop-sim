import type { CardInstance, StandardSuit } from '@tabletop/cards';
import { currentTrickWinner, getLegalPlays, rankStrength } from './rules';
import type {
  BotBidContext,
  BotBlindNilContext,
  BotPlayContext,
  SpadesBid,
} from './types';

function clampBid(value: number): number {
  return Math.max(1, Math.min(13, Math.round(value)));
}

function suitCounts(hand: readonly CardInstance[]): Record<StandardSuit, number> {
  const counts: Record<StandardSuit, number> = { clubs: 0, diamonds: 0, hearts: 0, spades: 0 };
  for (const card of hand) counts[card.suit] += 1;
  return counts;
}

function normalEstimate(hand: readonly CardInstance[]): number {
  const counts = suitCounts(hand);
  let estimate = 0;
  for (const card of hand) {
    if (card.rank === 'ace') estimate += 0.9;
    else if (card.rank === 'king' && counts[card.suit] <= 5) estimate += 0.65;
    else if (card.rank === 'queen' && counts[card.suit] <= 3) estimate += 0.35;
    if (card.suit === 'spades' && rankStrength(card.rank) >= 11) estimate += 0.45;
  }
  estimate += Math.max(0, counts.spades - 3) * 0.35;
  return clampBid(estimate);
}

function hardEstimate(hand: readonly CardInstance[]): number {
  const counts = suitCounts(hand);
  let estimate = 0;
  for (const suit of ['clubs', 'diamonds', 'hearts', 'spades'] as const) {
    const cards = hand.filter((card) => card.suit === suit);
    const ranks = new Set(cards.map((card) => card.rank));
    if (ranks.has('ace')) estimate += 0.95;
    if (ranks.has('king') && cards.length <= 6) estimate += ranks.has('ace') ? 0.8 : 0.55;
    if (ranks.has('queen') && cards.length <= 4) estimate += 0.3;
    if (suit !== 'spades' && cards.length <= 1) estimate += Math.max(0, counts.spades - 3) * 0.18;
  }
  estimate += hand.filter((card) => card.suit === 'spades' && rankStrength(card.rank) >= 10).length * 0.32;
  return clampBid(estimate);
}

export function chooseBotBid(context: BotBidContext): SpadesBid {
  const random = context.random ?? Math.random;
  if (context.difficulty === 'easy') {
    return { kind: 'normal', tricks: 1 + Math.floor(random() * 5) };
  }

  const estimate = context.difficulty === 'hard'
    ? hardEstimate(context.hand)
    : normalEstimate(context.hand);
  return { kind: 'normal', tricks: estimate };
}

/** Blind-nil decisions intentionally receive no hand, preventing hidden-card cheating. */
export function chooseBotBlindNil(context: BotBlindNilContext): boolean {
  const random = context.random ?? Math.random;
  const deficit = context.opponentScore - context.teamScore;
  const lateGame = Math.max(context.teamScore, context.opponentScore) >= context.targetScore * 0.65;
  if (context.difficulty === 'easy') return random() < 0.01;
  if (context.difficulty === 'normal') return deficit >= 150 && lateGame && random() < 0.08;
  return deficit >= 100 && lateGame && random() < 0.18;
}

function byStrengthAscending(a: CardInstance, b: CardInstance): number {
  return rankStrength(a.rank) - rankStrength(b.rank);
}

function cardWouldWin(context: BotPlayContext, card: CardInstance): boolean {
  if (context.trick.plays.length === 0) return false;
  const seatOrder = ['north', 'east', 'south', 'west'] as const;
  const leaderIndex = seatOrder.indexOf(context.trick.leader);
  const seat = seatOrder[(leaderIndex + context.trick.plays.length) % 4]!;
  return currentTrickWinner({
    leader: context.trick.leader,
    plays: [...context.trick.plays, { seat, card }],
  }) === seat;
}

export function chooseBotCard(context: BotPlayContext): CardInstance {
  const legal = getLegalPlays(context.hand, context.trick, context.spadesBroken);
  if (legal.length === 0) throw new Error('bot has no legal card to play');

  const random = context.random ?? Math.random;
  if (context.difficulty === 'easy') {
    return legal[Math.min(Math.floor(random() * legal.length), legal.length - 1)]!;
  }

  const sorted = [...legal].sort(byStrengthAscending);
  if (context.difficulty === 'normal' || context.trick.plays.length === 0) {
    return sorted[0]!;
  }

  const winning = sorted.filter((card) => cardWouldWin(context, card));
  return winning[0] ?? sorted[0]!;
}
