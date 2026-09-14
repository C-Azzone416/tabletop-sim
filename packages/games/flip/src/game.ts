import { shuffleCards } from '@tabletop/shared';
import { buildFlipDeck, drawFromShoe } from './deck';
import { eligibleTargets, isDuplicateNumber, nextActiveSeatIndex, nextSeatedIndex, playerIndex } from './rules';
import { hasSecondChance, isFlip7, scoreHandBreakdown } from './scoring';
import type {
  FlipCardEffect,
  FlipCardInstance,
  FlipGameState,
  FlipPlayerState,
  FlipResolutionEvent,
  FlipRoundResult,
  FlipScoreBreakdown,
  StartFlipGameOptions,
} from './types';

export function startFlipGame(options: StartFlipGameOptions): FlipGameState {
  const players = options.players;
  const random = options.random ?? Math.random;

  // #436 — deliberately left at 2, not raised to match the platform
  // registry's floor of 3. This package is a rules implementation: Flip's
  // rules genuinely work at 2 players, which is a true property of the
  // game. The registry's minimum of 3 is product policy, not a rule, and
  // belongs at that layer (@tabletop/shared's game-registry.ts) — encoding
  // it here would conflate the two. engine.createGame validates every
  // create_game against the registry's [min,max] before a room ever
  // reaches this function (both the WS handler and /dev/seed funnel
  // through it), so there is no reachable path to a 2-player Flip room
  // regardless of this being more permissive. Do not "fix" this to 3 in a
  // future dead-code/consistency sweep.
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

  // #434 — a 'left' seat gets no opening card and never becomes turnPlayerId:
  // filtered out of the deal order entirely, not just skipped once reached.
  const order: string[] = [];
  for (let step = 1; step <= state.players.length; step += 1) {
    const candidate = state.players[(state.dealerIndex + step) % state.players.length]!;
    if (candidate.status !== 'left') order.push(candidate.id);
  }

  // #434 — 'left' is the one status this reset must NOT touch: busted/frozen
  // are round-scoped (everyone gets a clean 'active' start next round), but
  // a departed player never plays again regardless of how many more rounds
  // this game has.
  const resetPlayers = state.players.map((player) =>
    player.status === 'left'
      ? player
      : { ...player, status: 'active' as const, hand: [] as FlipCardInstance[] },
  );

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

/**
 * #434 — removes a non-host player from an in-progress or between-rounds
 * game without ending it (contrast with Wire Game's #432, which ends the
 * mission). The departing seat is never deleted from `players` — indices
 * and `dealerIndex` stay stable — it is marked 'left' instead, which
 * {@link nextActiveSeatIndex}/{@link eligibleTargets} (status === 'active'
 * only) already exclude from turns and targeting, and {@link
 * nextSeatedIndex} (status !== 'left') excludes from ever becoming dealer
 * again. Idempotent: leaving twice is a no-op, not an error, since a
 * disconnect racing an explicit leave_game is a real possibility (#431).
 *
 * Mid-round rulings — Caroline's ruling gave the "confirm, remove, continue"
 * shape; these are this issue's own engine decisions, made because the
 * ruling didn't specify them:
 *
 * - It's their own live turn: treated exactly like a Freeze — the turn
 *   passes to the next active seat. No card is drawn, no risk introduced on
 *   their way out.
 * - They hold a pending action of their own (a drawn Freeze/Flip 3 awaiting
 *   THEIR target choice): the action is cancelled, not auto-resolved by a
 *   self-target. Auto-resolving would deal a self-targeted Flip 3 three
 *   more cards on their way out, risking a cascade (a nested Freeze/Flip 3,
 *   even a Flip 7) for a departure that should be a clean stop. If they
 *   also had an outer Flip 3 chain running (they were the original
 *   flipper), that whole chain is abandoned too — every level's remaining
 *   owed cards are forfeited, not dealt to anyone.
 * - They are the target of an outstanding Flip 3 level someone ELSE is
 *   running (a flip3Stack level with their id, not the flipper): only that
 *   level is closed out — their remaining owed cards forfeited — the rest
 *   of the chain and the flipper's own turn continue untouched.
 * - They are merely an eligible target of someone else's PENDING (not yet
 *   chosen) Freeze/Flip 3: no special handling needed. Once marked 'left'
 *   they simply stop being an eligible target; the flipper — who remains a
 *   legal self-target — always has at least one option.
 *
 * Scoring (#434's other engine substance): finalizeRound skips a 'left'
 * player entirely — no entry in that round's scores/breakdowns, their
 * totalScore never incremented again, and excluded from every win-condition
 * check (crossing 200, tie-break). Their `hand` is cleared here so a round
 * finalizing later never scores cards they can no longer act on. Removing
 * their COMPLETED-round history is the server's job (the engine has no
 * persistence) — see game-engine.ts's Flip dispatch.
 */
export function leaveGame(
  state: FlipGameState,
  playerId: string,
  random: () => number = Math.random,
): FlipGameState {
  const index = playerIndex(state.players, playerId);
  const player = state.players[index]!;
  if (player.status === 'left') return state;

  if (state.phase !== 'round-in-progress') {
    const players = replacePlayer(state.players, index, { ...player, status: 'left', hand: [] });
    const dealerIndex = state.dealerIndex === index ? nextSeatedIndex(players, index) : state.dealerIndex;
    return { ...state, players, dealerIndex, resolutionLog: [] };
  }

  const isTurnPlayer = state.turnPlayerId === playerId;

  const players = replacePlayer(state.players, index, { ...player, status: 'left', hand: [] });
  const flip3Stack = isTurnPlayer
    ? [] // the whole cascade was theirs to resolve — abandon it entirely,
      // not just the level(s) that happened to target them
    : state.flip3Stack.filter((level) => level.targetId !== playerId);
  const pendingAction = isTurnPlayer ? null : state.pendingAction;
  const dealQueue = state.dealQueue ? state.dealQueue.filter((id) => id !== playerId) : null;

  const current: FlipGameState = { ...state, players, flip3Stack, pendingAction, dealQueue, resolutionLog: [] };

  if (!isTurnPlayer) return current;

  // It was their live turn, or their own pending target choice — either way
  // that's cancelled/abandoned above. Resume exactly as the engine already
  // knows how to: finish the opening deal if one is still running (skipping
  // them, already filtered out of dealQueue), otherwise pass the turn on —
  // which may itself end the round if nobody else is left to act.
  if (current.dealQueue !== null) return advance(current, random);
  return finalizeLiveTurnIfSettled(current, playerId);
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
  // #396 — the breakdown is captured HERE, before the hands below are
  // cleared. `scoreHandBreakdown` is the same computation `scoreHand`
  // delegates to, so `total` is the score of record by construction and the
  // two cannot disagree.
  //
  // #434 — a 'left' player is skipped entirely, not scored at 0: they get
  // no entry in `scores`/`breakdowns` at all, so this round's history never
  // mentions them (their hand is already [] from leaveGame, so scoring it
  // would harmlessly total 0 anyway — the point is they must not appear in
  // the round's record, not just score nothing).
  const scores: Record<string, number> = {};
  const breakdowns: Record<string, FlipScoreBreakdown> = {};
  for (const player of state.players) {
    if (player.status === 'left') continue;
    const breakdown = scoreHandBreakdown(player.hand, player.status, player.id === flip7PlayerId);
    breakdowns[player.id] = breakdown;
    scores[player.id] = breakdown.total;
  }

  const discardAdditions = state.players.flatMap((player) => player.hand);
  // #434 — a 'left' player is passed through untouched: no hand to clear
  // (already [] since they left), no status reset (never 'active' again),
  // no score added (they have no entry in `scores` to add).
  const scoredPlayers = state.players.map((player) =>
    player.status === 'left'
      ? player
      : { ...player, hand: [] as FlipCardInstance[], status: 'active' as const, totalScore: player.totalScore + scores[player.id]! },
  );

  const roundResult: FlipRoundResult = { roundNumber: state.roundNumber, scores, flip7PlayerId, breakdowns };
  // #434 — a departed player's stale totalScore must never win the game for
  // them, or count toward whether ANYONE has crossed 200 — excluded from
  // every win-condition computation below, not just from scoring.
  const seated = scoredPlayers.filter((player) => player.status !== 'left');
  const maxTotal = Math.max(...seated.map((player) => player.totalScore));
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
      dealerIndex: nextSeatedIndex(scoredPlayers, state.dealerIndex),
      phase: 'awaiting-round-start',
      winnerId: null,
    };
  }

  const leaders = seated.filter((player) => player.totalScore === maxTotal);
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
    dealerIndex: nextSeatedIndex(scoredPlayers, state.dealerIndex),
    phase: 'awaiting-round-start',
    winnerId: null,
  };
}
