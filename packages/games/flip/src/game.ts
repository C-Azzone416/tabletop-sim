import { shuffleCards } from '@tabletop/shared';
import { buildFlipDeck, drawFromShoe } from './deck';
import { eligibleTargets, isDuplicateNumber, nextActiveSeatIndex, playerIndex } from './rules';
import { hasSecondChance, isFlip7, scoreHand } from './scoring';
import type {
  FlipCardEffect,
  FlipCardInstance,
  FlipGameState,
  FlipPlayerState,
  FlipResolutionEvent,
  FlipRoundResult,
  StartFlipGameOptions,
} from './types';

export function startFlipGame(options: StartFlipGameOptions): FlipGameState {
  const players = options.players;
  const random = options.random ?? Math.random;

  if (players.length < 2 || players.length > 5) {
    throw new RangeError('Flip requires between two and five players');
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new Error('player ids must be unique');
  }

  const shoe = shuffleCards(buildFlipDeck(), random);
  const dealerIndex = Math.min(Math.floor(random() * players.length), players.length - 1);

  return {
    players: players.map((player) => ({ ...player, status: 'active', hand: [], totalScore: 0 })),
    dealerIndex,
    roundNumber: 0,
    shoe,
    discard: [],
    phase: 'awaiting-round-start',
    turnPlayerId: null,
    pendingAction: null,
    flip3Stack: [],
    dealQueue: null,
    lastRoundResult: null,
    winnerId: null,
    resolutionLog: [],
  };
}

export function startRound(
  state: FlipGameState,
  dealerPlayerId: string,
  random: () => number = Math.random,
): FlipGameState {
  if (state.phase !== 'awaiting-round-start') {
    throw new Error('a round cannot be started right now');
  }
  const dealer = state.players[state.dealerIndex]!;
  if (dealer.id !== dealerPlayerId) {
    throw new Error("only the dealer can start the round");
  }

  const order: string[] = [];
  for (let step = 1; step <= state.players.length; step += 1) {
    order.push(state.players[(state.dealerIndex + step) % state.players.length]!.id);
  }

  const resetPlayers = state.players.map((player) => ({
    ...player,
    status: 'active' as const,
    hand: [] as FlipCardInstance[],
  }));

  return advance(
    {
      ...state,
      players: resetPlayers,
      roundNumber: state.roundNumber + 1,
      phase: 'round-in-progress',
      dealQueue: order,
      turnPlayerId: order[0]!,
      pendingAction: null,
      flip3Stack: [],
      resolutionLog: [],
    },
    random,
  );
}

export function hit(
  state: FlipGameState,
  playerId: string,
  random: () => number = Math.random,
): FlipGameState {
  requireLiveTurn(state, playerId);
  const drawn = drawCardTo({ ...state, resolutionLog: [] }, playerId, random, 'hit');

  if (drawn.effect === 'number-flip7') return finalizeRound(drawn.state, playerId);
  if (drawn.effect === 'freeze-drawn') return { ...drawn.state, pendingAction: { kind: 'freeze' } };
  if (drawn.effect === 'flip3-drawn') return { ...drawn.state, pendingAction: { kind: 'flip3' } };
  return finalizeLiveTurnIfSettled(drawn.state, playerId);
}

export function freeze(
  state: FlipGameState,
  playerId: string,
  random: () => number = Math.random,
): FlipGameState {
  requireLiveTurn(state, playerId);
  const index = playerIndex(state.players, playerId);
  const players = replacePlayer(state.players, index, { ...state.players[index]!, status: 'frozen' });
  return finalizeLiveTurnIfSettled({ ...state, players, resolutionLog: [] }, playerId);
}

export function chooseFreezeTarget(
  state: FlipGameState,
  flipperId: string,
  targetId: string,
  random: () => number = Math.random,
): FlipGameState {
  requirePendingAction(state, flipperId, 'freeze');
  requireEligibleTarget(state, targetId);

  const index = playerIndex(state.players, targetId);
  const players = replacePlayer(state.players, index, { ...state.players[index]!, status: 'frozen' });
  const next: FlipGameState = { ...state, players, pendingAction: null, resolutionLog: [] };

  if (next.dealQueue !== null) return advance(next, random);
  const flipperTurnId = next.turnPlayerId!;
  return finalizeLiveTurnIfSettled(advance(next, random), flipperTurnId);
}

export function chooseFlip3Target(
  state: FlipGameState,
  flipperId: string,
  targetId: string,
  random: () => number = Math.random,
): FlipGameState {
  requirePendingAction(state, flipperId, 'flip3');
  requireEligibleTarget(state, targetId);

  const next: FlipGameState = {
    ...state,
    pendingAction: null,
    flip3Stack: [...state.flip3Stack, { targetId, remaining: 3 }],
    resolutionLog: [],
  };

  if (next.dealQueue !== null) return advance(next, random);
  const flipperTurnId = next.turnPlayerId!;
  return finalizeLiveTurnIfSettled(advance(next, random), flipperTurnId);
}

// --- internals -------------------------------------------------------------

function requireLiveTurn(state: FlipGameState, playerId: string): void {
  if (state.phase !== 'round-in-progress') throw new Error('no round is in progress');
  if (state.dealQueue !== null) throw new Error('the opening deal has not finished');
  if (state.pendingAction) throw new Error('a target choice is pending');
  if (state.flip3Stack.length > 0) throw new Error('a Flip 3 is still resolving');
  if (state.turnPlayerId !== playerId) throw new Error("it is not this player's turn");
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.status !== 'active') throw new Error('player is not active');
}

function requirePendingAction(
  state: FlipGameState,
  flipperId: string,
  kind: 'freeze' | 'flip3',
): void {
  if (state.phase !== 'round-in-progress') throw new Error('no round is in progress');
  if (!state.pendingAction || state.pendingAction.kind !== kind) {
    throw new Error(`no ${kind} target is pending`);
  }
  if (state.turnPlayerId !== flipperId) throw new Error("it is not this player's action to resolve");
}

function requireEligibleTarget(state: FlipGameState, targetId: string): void {
  if (!eligibleTargets(state.players).some((player) => player.id === targetId)) {
    throw new Error('target is not an eligible (active) player');
  }
}

function replacePlayer(
  players: readonly FlipPlayerState[],
  index: number,
  next: FlipPlayerState,
): FlipPlayerState[] {
  const copy = [...players];
  copy[index] = next;
  return copy;
}

function applyCard(
  players: readonly FlipPlayerState[],
  recipientId: string,
  discard: readonly FlipCardInstance[],
  card: FlipCardInstance,
): { players: readonly FlipPlayerState[]; discard: readonly FlipCardInstance[]; effect: FlipCardEffect } {
  const index = playerIndex(players, recipientId);
  const player = players[index]!;

  if (card.kind === 'number') {
    if (isDuplicateNumber(player.hand, card.value)) {
      const secondChance = player.hand.find(
        (candidate) => candidate.kind === 'action' && candidate.action === 'second-chance',
      );
      if (secondChance) {
        const hand = player.hand.filter((candidate) => candidate.id !== secondChance.id);
        return {
          players: replacePlayer(players, index, { ...player, hand }),
          discard: [...discard, card, secondChance],
          effect: 'number-saved',
        };
      }
      return {
        players: replacePlayer(players, index, { ...player, hand: [], status: 'busted' }),
        discard: [...discard, ...player.hand, card],
        effect: 'number-busted',
      };
    }
    const hand = [...player.hand, card];
    return {
      players: replacePlayer(players, index, { ...player, hand }),
      discard,
      effect: isFlip7(hand) ? 'number-flip7' : 'number-added',
    };
  }

  if (card.kind === 'modifier') {
    const hand = [...player.hand, card];
    return { players: replacePlayer(players, index, { ...player, hand }), discard, effect: 'modifier-added' };
  }

  if (card.action === 'second-chance') {
    if (hasSecondChance(player.hand)) {
      return { players, discard: [...discard, card], effect: 'second-chance-discarded' };
    }
    const hand = [...player.hand, card];
    return { players: replacePlayer(players, index, { ...player, hand }), discard, effect: 'second-chance-gained' };
  }

  if (card.action === 'freeze') {
    return { players, discard: [...discard, card], effect: 'freeze-drawn' };
  }

  return { players, discard: [...discard, card], effect: 'flip3-drawn' };
}

function drawCardTo(
  state: FlipGameState,
  recipientId: string,
  random: () => number,
  context: FlipResolutionEvent['context'],
): { state: FlipGameState; effect: FlipCardEffect } {
  const { card, shoe, discard } = drawFromShoe(state.shoe, state.discard, random);
  const applied = applyCard(state.players, recipientId, discard, card);
  const event: FlipResolutionEvent = { targetId: recipientId, card, effect: applied.effect, context };
  return {
    state: {
      ...state,
      players: applied.players,
      shoe,
      discard: applied.discard,
      resolutionLog: [...state.resolutionLog, event],
    },
    effect: applied.effect,
  };
}

/**
 * Resolves everything automatic: dealing the opening card queue and
 * processing outstanding Flip 3 levels. Stops (returns) as soon as the round
 * ends, a target choice is needed, or nothing automatic is left to do.
 */
function advance(state: FlipGameState, random: () => number): FlipGameState {
  let current = state;

  while (current.phase === 'round-in-progress') {
    if (current.pendingAction) return current;

    if (current.flip3Stack.length > 0) {
      const level = current.flip3Stack[current.flip3Stack.length - 1]!;
      if (level.remaining === 0) {
        current = { ...current, flip3Stack: current.flip3Stack.slice(0, -1) };
        continue;
      }

      const drawn = drawCardTo(current, level.targetId, random, 'flip3');
      current = {
        ...drawn.state,
        flip3Stack: [
          ...drawn.state.flip3Stack.slice(0, -1),
          { targetId: level.targetId, remaining: level.remaining - 1 },
        ],
      };

      if (drawn.effect === 'number-flip7') return finalizeRound(current, level.targetId);
      if (drawn.effect === 'number-busted') {
        current = { ...current, flip3Stack: current.flip3Stack.slice(0, -1) };
        continue;
      }
      if (drawn.effect === 'freeze-drawn') {
        current = { ...current, flip3Stack: current.flip3Stack.slice(0, -1), pendingAction: { kind: 'freeze' } };
        return current;
      }
      if (drawn.effect === 'flip3-drawn') {
        current = { ...current, pendingAction: { kind: 'flip3' } };
        return current;
      }
      continue;
    }

    if (current.dealQueue !== null) {
      if (current.dealQueue.length === 0) {
        const nextIndex = nextActiveSeatIndex(current.players, current.dealerIndex);
        if (nextIndex === null) {
          current = { ...current, dealQueue: null };
          return finalizeRound(current, null);
        }
        current = { ...current, dealQueue: null, turnPlayerId: current.players[nextIndex]!.id };
        continue;
      }

      const queue = current.dealQueue;
      const recipientId = queue[0]!;
      current = { ...current, turnPlayerId: recipientId };
      const drawn = drawCardTo(current, recipientId, random, 'deal');
      current = { ...drawn.state, dealQueue: queue.slice(1) };

      if (drawn.effect === 'number-flip7') return finalizeRound(current, recipientId);
      if (drawn.effect === 'freeze-drawn') return { ...current, pendingAction: { kind: 'freeze' } };
      if (drawn.effect === 'flip3-drawn') return { ...current, pendingAction: { kind: 'flip3' } };
      continue;
    }

    return current;
  }

  return current;
}

/** After a live-turn action fully settles (no pending choice, no Flip 3 left), passes the turn on or ends the round. */
function finalizeLiveTurnIfSettled(state: FlipGameState, flipperId: string): FlipGameState {
  if (state.phase !== 'round-in-progress') return state;
  if (state.pendingAction) return state;
  if (state.flip3Stack.length > 0) return state;

  const index = playerIndex(state.players, flipperId);
  const nextIndex = nextActiveSeatIndex(state.players, index);
  if (nextIndex === null) return finalizeRound(state, null);
  return { ...state, turnPlayerId: state.players[nextIndex]!.id };
}

function finalizeRound(state: FlipGameState, flip7PlayerId: string | null): FlipGameState {
  const scores: Record<string, number> = {};
  for (const player of state.players) {
    scores[player.id] = scoreHand(player.hand, player.status, player.id === flip7PlayerId);
  }

  const discardAdditions = state.players.flatMap((player) => player.hand);
  const scoredPlayers = state.players.map((player) => ({
    ...player,
    hand: [] as FlipCardInstance[],
    status: 'active' as const,
    totalScore: player.totalScore + scores[player.id]!,
  }));

  const roundResult: FlipRoundResult = { roundNumber: state.roundNumber, scores, flip7PlayerId };
  const maxTotal = Math.max(...scoredPlayers.map((player) => player.totalScore));
  const base: FlipGameState = {
    ...state,
    players: scoredPlayers,
    discard: [...state.discard, ...discardAdditions],
    turnPlayerId: null,
    pendingAction: null,
    flip3Stack: [],
    dealQueue: null,
    lastRoundResult: roundResult,
  };

  if (maxTotal < 200) {
    return {
      ...base,
      dealerIndex: (state.dealerIndex + 1) % state.players.length,
      phase: 'awaiting-round-start',
      winnerId: null,
    };
  }

  const leaders = scoredPlayers.filter((player) => player.totalScore === maxTotal);
  const winner =
    leaders.length === 1
      ? leaders[0]!
      : (() => {
          const maxRoundScore = Math.max(...leaders.map((player) => scores[player.id]!));
          const roundLeaders = leaders.filter((player) => scores[player.id] === maxRoundScore);
          return roundLeaders.length === 1 ? roundLeaders[0]! : null;
        })();

  if (winner) {
    return { ...base, phase: 'game-over', winnerId: winner.id };
  }

  // Still tied even on the final round's score: play another full round.
  return {
    ...base,
    dealerIndex: (state.dealerIndex + 1) % state.players.length,
    phase: 'awaiting-round-start',
    winnerId: null,
  };
}
