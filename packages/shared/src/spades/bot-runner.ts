import { chooseBotBid, chooseBotBlindNil, chooseBotCard } from './bots.js';
import {
  getLegalCardsForCurrentSeat,
  playCard,
  submitBid,
  submitBlindNilChoice,
} from './game.js';
import { teamForSeat } from './rules.js';
import { SPADES_SEATS, type SpadesGameState, type SpadesSeat } from './types.js';

export const BOT_DELAY_MIN_MS = 600;
export const BOT_DELAY_MAX_MS = 1200;

export interface BotTurnRunnerOptions {
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly onState?: (state: SpadesGameState) => void | Promise<void>;
}

function playerAt(state: SpadesGameState, seat: SpadesSeat) {
  return state.players.find((player) => player.seat === seat);
}

function nextBotSeat(state: SpadesGameState): SpadesSeat | null {
  if (state.phase === 'blind-nil') {
    return SPADES_SEATS.find((seat) => {
      const player = playerAt(state, seat);
      return player?.isBot && state.blindNilChoices[seat] === undefined;
    }) ?? null;
  }
  if ((state.phase === 'bidding' || state.phase === 'playing') && state.currentSeat) {
    return playerAt(state, state.currentSeat)?.isBot ? state.currentSeat : null;
  }
  return null;
}

export function botTurnDelay(random: () => number = Math.random): number {
  const unit = Math.max(0, Math.min(random(), 1));
  return Math.round(BOT_DELAY_MIN_MS + unit * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS));
}

export function advanceOneBotTurn(
  state: SpadesGameState,
  random: () => number = Math.random,
): SpadesGameState {
  const seat = nextBotSeat(state);
  if (!seat) return state;
  const player = playerAt(state, seat);
  if (!player?.isBot || !player.difficulty) return state;

  if (state.phase === 'blind-nil') {
    const team = teamForSeat(seat);
    const opponent = team === 'north-south' ? 'east-west' : 'north-south';
    const blindNil = chooseBotBlindNil({
      difficulty: player.difficulty,
      teamScore: state.scores[team].score,
      opponentScore: state.scores[opponent].score,
      targetScore: state.targetScore,
      random,
    });
    return submitBlindNilChoice(state, seat, blindNil);
  }

  if (state.phase === 'bidding') {
    const bid = chooseBotBid({
      hand: state.hands[seat],
      difficulty: player.difficulty,
      random,
    });
    if (bid.kind === 'blind-nil') throw new Error('blind nil must be chosen before bidding');
    return submitBid(state, seat, bid);
  }

  const legal = getLegalCardsForCurrentSeat(state);
  if (legal.length === 0) throw new Error('bot has no legal card');
  const card = chooseBotCard({
    hand: state.hands[seat],
    trick: state.currentTrick,
    spadesBroken: state.spadesBroken,
    difficulty: player.difficulty,
    random,
  });
  return playCard(state, seat, card.id, random);
}

export async function runBotTurns(
  initialState: SpadesGameState,
  options: BotTurnRunnerOptions = {},
): Promise<SpadesGameState> {
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  let state = initialState;

  while (nextBotSeat(state)) {
    await sleep(botTurnDelay(random));
    state = advanceOneBotTurn(state, random);
    await options.onState?.(state);
  }
  return state;
}
