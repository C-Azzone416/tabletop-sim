// #382 — maps the engine's FlipGameState onto the wire DTO.
//
// This mapping exists to DROP things, not just to rename them. The engine
// state holds the undrawn shoe and the full discard pile; neither may reach a
// client:
//   - the shoe is the round's entire future (#358 — "no hidden state" is about
//     hands being face up, not about the deck)
//   - the discard is deliberately not browsable, because #358 rules that
//     "memory stays a skill"
// Both are persisted in flip_games for the reshuffle; only counts go out.
//
// The one thing it ADDS is derived-from-a-rule data — eligible targets and
// unique-number counts — so the client renders a list instead of
// re-implementing an engine rule and risking disagreement with it.

import { countUniqueNumbers, eligibleTargets, type FlipGameState } from '@tabletop/game-flip';
import type { FlipCardView, FlipRoundScoreView, FlipTableView } from '@tabletop/shared';
import type { FlipRoundScoreRow } from '../db/flip-games.js';

/**
 * #396 — completed rounds, grouped by player, ascending. Read from
 * flip_round_scores rather than from the state blob: a round's score is an
 * immutable historical fact, and the blob deliberately holds only the current
 * round plus cumulative totals.
 */
export function groupRoundsByPlayer(
  rows: readonly FlipRoundScoreRow[],
): Map<string, FlipRoundScoreView[]> {
  const byPlayer = new Map<string, FlipRoundScoreView[]>();
  for (const row of [...rows].sort((a, b) => a.roundNumber - b.roundNumber)) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push({
      roundNumber: row.roundNumber,
      score: row.score,
      busted: row.busted,
      flip7: row.flip7,
      breakdown: row.breakdown,
    });
    byPlayer.set(row.playerId, list);
  }
  return byPlayer;
}

export function toFlipTableView(
  state: FlipGameState,
  roundsByPlayer: Map<string, FlipRoundScoreView[]> = new Map(),
): FlipTableView {
  const dealer = state.players[state.dealerIndex];
  if (!dealer) throw new Error(`flip state has no seat at dealerIndex ${state.dealerIndex}`);

  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    dealerId: dealer.id,
    turnPlayerId: state.turnPlayerId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      status: player.status,
      // Face up to everyone — no per-player redaction in this game.
      hand: player.hand as readonly FlipCardView[],
      totalScore: player.totalScore,
      uniqueNumberCount: countUniqueNumbers(player.hand),
      rounds: roundsByPlayer.get(player.id) ?? [],
    })),
    shoeRemaining: state.shoe.length,
    discardCount: state.discard.length,
    pendingAction:
      state.pendingAction === null || state.turnPlayerId === null
        ? null
        : {
            kind: state.pendingAction.kind,
            flipperId: state.turnPlayerId,
            // Resolved from the engine's own eligibility rule rather than
            // re-derived client-side (#363's picker renders this array).
            eligibleTargetIds: eligibleTargets(state.players).map((player) => player.id),
          },
    flip3Stack: state.flip3Stack.map((level) => ({
      targetId: level.targetId,
      remaining: level.remaining,
    })),
    lastRoundResult: state.lastRoundResult
      ? {
          roundNumber: state.lastRoundResult.roundNumber,
          scores: state.lastRoundResult.scores,
          flip7PlayerId: state.lastRoundResult.flip7PlayerId,
        }
      : null,
    winnerId: state.winnerId,
    resolutionLog: state.resolutionLog.map((event) => ({
      targetId: event.targetId,
      card: event.card as FlipCardView,
      effect: event.effect,
      context: event.context,
    })),
  };
}
