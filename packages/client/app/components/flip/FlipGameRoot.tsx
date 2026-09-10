"use client";

/**
 * #383 — the missing mount point. Bridges the #382 `FlipTableView` wire
 * shape to #362/#363's existing `FlipTable`/`PendingActionPicker` (which
 * take engine-types.ts's `FlipGameState` shape), and owns the two phases
 * neither of those components renders: the dealer's "start the round"
 * action (#358: dealer triggers round start explicitly) and the game-over
 * winner display.
 */

import { FlipTable } from "./FlipTable";
import { PendingActionPicker } from "./PendingActionPicker";
import { FlipScoreboard } from "./FlipScoreboard";
import type { FlipGameState as EngineFlipGameState } from "./engine-types";
import type { FlipTableView } from "@tabletop/shared";

// #396 — FlipTableView.players already carries `id`/`name`/`rounds` in the
// exact shape FlipScoreboard wants (see the issue's payload spec, matched
// field-for-field by #398's FlipPlayerView/FlipRoundScoreView). No adapter
// beyond narrowing the array — resist the urge to reshape this again.
function toScoreboardPlayers(players: FlipTableView["players"]) {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    rounds: player.rounds,
  }));
}

export interface FlipGameRootProps {
  flip: FlipTableView;
  localPlayerId: string;
  onHit: () => void;
  onFreeze: () => void;
  onChooseFreezeTarget: (targetId: string) => void;
  onChooseFlip3Target: (targetId: string) => void;
  onStartRound: () => void;
}

// FlipTable/PendingActionPicker never read shoe/discard *contents* — only
// CardsRemaining's `.length`, and the discard pile isn't rendered at all
// (#358: "not browsable, memory stays a skill"). FlipTableView only sends
// counts (deliberately — see #382), so these arrays exist purely to satisfy
// engine-types.ts's shape; their contents are never read.
const PLACEHOLDER_CARD = { id: "placeholder", kind: "number" as const, value: 0 as const };

function toEngineGameState(view: FlipTableView): EngineFlipGameState {
  const dealerIndex = Math.max(
    0,
    view.players.findIndex((player) => player.id === view.dealerId),
  );
  return {
    players: view.players,
    dealerIndex,
    roundNumber: view.roundNumber,
    shoe: Array.from({ length: view.shoeRemaining }, () => PLACEHOLDER_CARD),
    discard: Array.from({ length: view.discardCount }, () => PLACEHOLDER_CARD),
    phase: view.phase,
    turnPlayerId: view.turnPlayerId,
    pendingAction: view.pendingAction,
    flip3Stack: view.flip3Stack,
    lastRoundResult: view.lastRoundResult,
    winnerId: view.winnerId,
    resolutionLog: view.resolutionLog,
  };
}

export function FlipGameRoot({
  flip,
  localPlayerId,
  onHit,
  onFreeze,
  onChooseFreezeTarget,
  onChooseFlip3Target,
  onStartRound,
}: FlipGameRootProps) {
  if (flip.phase === "game-over") {
    const winner = flip.players.find((player) => player.id === flip.winnerId);
    return (
      <div data-testid="flip-game-over" className="flex flex-col items-center gap-4 p-6 text-center">
        <p className="text-lg font-bold text-ink">{winner ? `${winner.name} wins!` : "Game over"}</p>
        <FlipScoreboard players={toScoreboardPlayers(flip.players)} />
      </div>
    );
  }

  if (flip.phase === "awaiting-round-start") {
    const isDealer = localPlayerId === flip.dealerId;
    return (
      <div data-testid="flip-awaiting-round-start" className="flex flex-col items-center gap-4 p-6 text-center">
        <p className="text-sm text-ink-muted">
          {isDealer
            ? "You're the dealer — start the next round when ready."
            : "Waiting on the dealer to start the round…"}
        </p>
        {isDealer && (
          <button
            type="button"
            onClick={onStartRound}
            className="press rounded-cab border-2 border-outline bg-accent px-6 py-3 text-base font-bold text-accent-ink shadow-print-md"
          >
            Start Round
          </button>
        )}
        {/* Nothing to show before round 1 ever completes — checked on the
            data itself (every player's rounds is []), not roundNumber,
            since that field's exact semantics at this phase aren't ours
            to assume. */}
        {flip.players.some((p) => p.rounds.length > 0) && (
          <FlipScoreboard players={toScoreboardPlayers(flip.players)} />
        )}
      </div>
    );
  }

  const game = toEngineGameState(flip);

  return (
    <FlipTable
      game={game}
      localPlayerId={localPlayerId}
      onHit={onHit}
      onFreeze={onFreeze}
      // #366's C4 timeout self-targets through these same two callbacks
      // (see FlipTable's own doc comment) — without passing them through,
      // a Freeze/Flip3 target-choice timeout has nothing to call and the
      // prompt would hang forever even once turnDeadline exists.
      onChooseFreezeTarget={onChooseFreezeTarget}
      onChooseFlip3Target={onChooseFlip3Target}
      pendingActionUi={
        <PendingActionPicker
          game={game}
          localPlayerId={localPlayerId}
          onChooseFreezeTarget={onChooseFreezeTarget}
          onChooseFlip3Target={onChooseFlip3Target}
        />
      }
    />
  );
}
