import {
  type HandScoreInput,
  type HandScoreResult,
  type SpadesBid,
  type SpadesSeat,
  type SpadesTeam,
  type TargetScore,
  type TeamScore,
} from './types.js';
import { seatsForTeam } from './rules.js';

function nilValue(bid: SpadesBid): number {
  if (bid.kind === 'nil') return 100;
  if (bid.kind === 'blind-nil') return 200;
  return 0;
}

export function scoreHand(input: HandScoreInput): HandScoreResult {
  const seats = seatsForTeam(input.team);
  const contract = seats.reduce((sum, seat) => {
    const bid = input.bids[seat];
    return sum + (bid.kind === 'normal' ? bid.tricks : 0);
  }, 0);
  const teamTricks = seats.reduce((sum, seat) => sum + input.tricksWon[seat], 0);
  const contractMade = teamTricks >= contract;
  const contractPoints = contractMade ? contract * 10 : contract * -10;

  const nilPoints = seats.reduce((sum, seat) => {
    const bid = input.bids[seat];
    const value = nilValue(bid);
    if (value === 0) return sum;
    return sum + (input.tricksWon[seat] === 0 ? value : -value);
  }, 0);

  const overtricks = contractMade ? Math.max(0, teamTricks - contract) : 0;
  const accumulatedBags = input.previous.bags + overtricks;
  const penalties = Math.floor(accumulatedBags / 10);
  const bagPenalty = penalties * -100;
  const bags = accumulatedBags % 10;
  const bagPoints = overtricks;
  const handPoints = contractPoints + nilPoints + bagPoints + bagPenalty;

  return {
    score: input.previous.score + handPoints,
    bags,
    handPoints,
    contractPoints,
    nilPoints,
    bagPoints,
    bagPenalty,
    contractMade,
  };
}

export type GameWinner = SpadesTeam | 'tie' | null;

export function determineWinner(
  scores: Readonly<Record<SpadesTeam, TeamScore>>,
  target: TargetScore,
): GameWinner {
  const northSouth = scores['north-south'].score;
  const eastWest = scores['east-west'].score;
  if (northSouth < target && eastWest < target) return null;
  if (northSouth === eastWest) return 'tie';
  return northSouth > eastWest ? 'north-south' : 'east-west';
}

export function emptyTrickCounts(): Record<SpadesSeat, number> {
  return { north: 0, east: 0, south: 0, west: 0 };
}
