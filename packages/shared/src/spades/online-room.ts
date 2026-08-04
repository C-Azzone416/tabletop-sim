import { playCard, submitBid, submitBlindNilChoice } from './game.js';
import type {
  SpadesBid,
  SpadesGameState,
  SpadesPlayerView,
  SpadesSeat,
} from './types.js';
import { buildSpadesPlayerView } from './game.js';

export type SpadesPlayerAction =
  | { readonly type: 'blind-nil'; readonly blindNil: boolean }
  | { readonly type: 'bid'; readonly bid: Exclude<SpadesBid, { kind: 'blind-nil' }> }
  | { readonly type: 'play'; readonly cardId: string };

export function seatForSpadesPlayer(
  state: SpadesGameState,
  playerId: string,
): SpadesSeat {
  const player = state.players.find((candidate) => candidate.id === playerId && !candidate.isBot);
  if (!player) throw new Error('Player is not seated in this Spades game');
  return player.seat;
}

export function applySpadesPlayerAction(
  state: SpadesGameState,
  playerId: string,
  action: SpadesPlayerAction,
  random: () => number = Math.random,
): SpadesGameState {
  const seat = seatForSpadesPlayer(state, playerId);
  if (action.type === 'blind-nil') {
    return submitBlindNilChoice(state, seat, action.blindNil);
  }
  if (action.type === 'bid') {
    return submitBid(state, seat, action.bid);
  }
  return playCard(state, seat, action.cardId, random);
}

export function buildPrivateSpadesView(
  state: SpadesGameState,
  playerId: string,
): { readonly seat: SpadesSeat; readonly view: SpadesPlayerView } {
  const seat = seatForSpadesPlayer(state, playerId);
  return { seat, view: buildSpadesPlayerView(state, seat) };
}
