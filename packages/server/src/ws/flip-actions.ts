// #387 — the Flip action path: client action -> authorize -> engine -> persist
// -> broadcast.
//
// Every authorization decision for Flip lives in this file, deliberately, so
// it can be audited in one place rather than traced across four handlers.
//
// The load-bearing rule: **the acting player comes from the socket, never from
// the message.** ClientMessage's Flip variants carry no acting-player field at
// all, so a client cannot claim to be another seat — there is nothing to
// claim it in. `connectionPlayerId` below is the id bound at authentication.
//
// That is also why the DevPanel seat switcher is not an authorization bypass:
// it does not spoof a seat, it re-authenticates as that seat's profile. Dev
// seeding hands out every seat's profileId, which makes switching trivial in
// dev; a real game needs the real credential. The gate is authentication,
// unchanged, rather than a per-message check added here.

import {
  chooseFlip3Target,
  chooseFreezeTarget,
  eligibleTargets,
  freeze,
  hit,
  startRound,
  type FlipGameState,
} from '@tabletop/game-flip';
import * as flipGamesDb from '../db/flip-games.js';

export type FlipActionKind =
  | { readonly kind: 'start-round' }
  | { readonly kind: 'hit' }
  | { readonly kind: 'freeze' }
  | { readonly kind: 'choose-freeze-target'; readonly targetPlayerId: string }
  | { readonly kind: 'choose-flip3-target'; readonly targetPlayerId: string };

/**
 * Applies one Flip action and returns the new state, or throws with a message
 * safe to send to the client.
 *
 * Pure with respect to transport: it takes the current state and the
 * *authenticated* player id, and knows nothing about sockets. That is what
 * makes the authorization rules testable without a WebSocket.
 */
export function applyFlipAction(
  state: FlipGameState,
  connectionPlayerId: string,
  action: FlipActionKind,
): FlipGameState {
  // #358 — the dealer triggers each round explicitly, including the first.
  // Handled before the round-in-progress guard below: this is the one
  // action that is only ever legal when a round is NOT in progress. The
  // engine's own startRound already enforces dealer-only and phase, so
  // there is nothing further to check here.
  if (action.kind === 'start-round') {
    return startRound(state, connectionPlayerId);
  }

  if (state.phase !== 'round-in-progress') {
    throw new Error('No round is in progress');
  }

  if (action.kind === 'hit' || action.kind === 'freeze') {
    // A hit or freeze is only ever the turn player's to make. Checked before
    // the engine so the error is a clear authorization failure rather than an
    // engine invariant message.
    if (state.turnPlayerId !== connectionPlayerId) {
      throw new Error('Not your turn');
    }
    // A drawn action card must be resolved before anything else happens.
    if (state.pendingAction !== null) {
      throw new Error('Resolve the pending action card first');
    }
    return action.kind === 'hit' ? hit(state, connectionPlayerId) : freeze(state, connectionPlayerId);
  }

  // --- target choices ---

  const pending = state.pendingAction;
  if (pending === null) {
    throw new Error('No action card is awaiting a target');
  }

  // Only the flipper chooses. `turnPlayerId` is the flipper for the whole
  // chain a Hit triggers, which is why it is the right thing to compare.
  if (state.turnPlayerId !== connectionPlayerId) {
    throw new Error('Only the player who flipped the card may choose its target');
  }

  // A Freeze choice must not resolve a pending Flip 3, or vice versa — the two
  // do very different things and a mismatched pair would silently apply the
  // wrong one.
  const expected = action.kind === 'choose-freeze-target' ? 'freeze' : 'flip3';
  if (pending.kind !== expected) {
    throw new Error(`A ${pending.kind === 'freeze' ? 'Freeze' : 'Flip 3'} target is awaited`);
  }

  // Target legality is decided by the ENGINE's eligibility rule, never by
  // anything the client sent. This pre-check exists only to produce a clean
  // message; the engine's own guard inside chooseFreezeTarget /
  // chooseFlip3Target remains the authority and would throw regardless.
  const legal = eligibleTargets(state.players).some((player) => player.id === action.targetPlayerId);
  if (!legal) {
    throw new Error('That player is not a legal target');
  }

  return action.kind === 'choose-freeze-target'
    ? chooseFreezeTarget(state, connectionPlayerId, action.targetPlayerId)
    : chooseFlip3Target(state, connectionPlayerId, action.targetPlayerId);
}

/**
 * Loads, authorizes, applies and persists. The caller broadcasts — this
 * returns nothing, because every client learns the outcome the same way, from
 * the #382 `game_state` broadcast, rather than from a bespoke reply.
 */
export async function executeFlipAction(
  gameId: string,
  connectionPlayerId: string,
  action: FlipActionKind,
): Promise<void> {
  const stored = await flipGamesDb.getFlipGameState(gameId);
  if (!stored) throw new Error('This game has no Flip state');

  const before = stored as FlipGameState;
  const next = applyFlipAction(before, connectionPlayerId, action);
  await flipGamesDb.saveFlipGameState(gameId, next);
  await recordRoundIfJustScored(gameId, before, next);
}

/**
 * #396 — the gap this closes: `recordFlipRoundScores` existed and was tested,
 * but nothing in the live flow ever called it, so `flip_round_scores` stayed
 * empty and the scoreboard had no history to show.
 *
 * A round can finalize inside any of the four actions (a Flip 7 on a hit, the
 * last player freezing, a Flip 3 busting everyone), so rather than trying to
 * predict which action ends a round, this compares before and after: a
 * `lastRoundResult` whose round number just changed means exactly one round
 * scored during that call.
 *
 * Failing to record must not fail the action — the score is already in
 * `totalScore` in the state blob, which is the figure of record. Losing a
 * history row degrades the scoreboard's detail; throwing here would lose the
 * player's turn.
 */
async function recordRoundIfJustScored(
  gameId: string,
  before: FlipGameState,
  after: FlipGameState,
): Promise<void> {
  const result = after.lastRoundResult;
  if (!result) return;
  if (before.lastRoundResult?.roundNumber === result.roundNumber) return;

  try {
    await flipGamesDb.recordFlipRoundScores(
      gameId,
      result.roundNumber,
      after.players.map((player) => {
        const breakdown = result.breakdowns?.[player.id] ?? null;
        return {
          playerId: player.id,
          score: result.scores[player.id] ?? 0,
          busted: breakdown?.busted ?? false,
          flip7: result.flip7PlayerId === player.id,
          breakdown,
        };
      }),
    );
  } catch (err) {
    console.error('[flip] failed to record round scores', { gameId, roundNumber: result.roundNumber, err });
  }
}
