"use client";

/**
 * #383 — the missing mount point. Bridges the #382 `FlipTableView` wire
 * shape to #362/#363's existing `FlipTable`/`PendingActionPicker` (which
 * take engine-types.ts's `FlipGameState` shape), and owns the two phases
 * neither of those components renders: the dealer's "start the round"
 * action (#358: dealer triggers round start explicitly) and the game-over
 * winner display.
 */

import { useState } from "react";
import { FlipTable } from "./FlipTable";
import { PendingActionPicker } from "./PendingActionPicker";
import { FlipScoreboard } from "./FlipScoreboard";
import { BustNotice } from "./BustNotice";
import type { FlipGameState as EngineFlipGameState } from "./engine-types";
import type { FlipResolutionEventView, FlipTableView } from "@tabletop/shared";

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
  /** #448 — passed straight through to FlipTable/SeatRail; see SeatRail's own doc comment. */
  reconnectingIds?: readonly string[];
  /**
   * #494 — Caroline's ruling: the exact shoe count is a developer aid, not
   * normal play ("we should not show 91 cards left in the shoe... in /dev
   * its fine but that shouldn't be a normal showed item"). Passed straight
   * through to FlipTable/CardsRemaining; the decision belongs at the
   * GameClient call site (NEXT_PUBLIC_ENABLE_DEV_TOOLS), not read from
   * process.env here or in FlipTable/CardsRemaining themselves. Optional
   * (default false, matching the production-safe state) so tests unrelated
   * to this flag don't need to pass it explicitly.
   */
  devToolsEnabled?: boolean;
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

/**
 * A stable identity for one "batch" of resolutionLog events — the log is
 * "reset per action, not a history" (FlipTableView's own doc comment), so a
 * fresh WS broadcast of the *same* action's events is indistinguishable from
 * the array by reference alone (every broadcast deserializes new objects).
 * Comparing this string catches "the log actually changed" without needing
 * the engine to hand out event ids.
 */
function resolutionLogSignature(events: readonly FlipResolutionEventView[]): string {
  return events.map((e) => `${e.targetId}:${e.effect}:${e.card.id}`).join("|");
}

export function FlipGameRoot({
  flip,
  localPlayerId,
  onHit,
  onFreeze,
  onChooseFreezeTarget,
  onChooseFlip3Target,
  onStartRound,
  reconnectingIds,
  devToolsEnabled = false,
}: FlipGameRootProps) {
  // #422 — every bust gets an explicit, dismissed notice, not just the ones
  // that happen to fall inside a Freeze/Flip3 pending-action pause. Queued
  // (not just "the latest") because one Flip 3 resolution can bust more than
  // one player in a single broadcast.
  const logSignature = resolutionLogSignature(flip.resolutionLog);
  // Sentinel, not the initial signature: a bust already present in the very
  // first resolutionLog this component ever sees (e.g. mounting mid-game
  // after a reconnect) must still show a notice, not be treated as "already
  // seen" just because it was there on mount.
  const [trackedLogSignature, setTrackedLogSignature] = useState("");
  const [bustQueue, setBustQueue] = useState<readonly FlipResolutionEventView[]>([]);
  if (logSignature !== trackedLogSignature) {
    setTrackedLogSignature(logSignature);
    const newBusts = flip.resolutionLog.filter((e) => e.effect === "number-busted");
    if (newBusts.length > 0) setBustQueue((queue) => [...queue, ...newBusts]);
  }

  const activeBust = bustQueue[0];
  const bustNotice = activeBust ? (
    <BustNotice
      playerName={flip.players.find((p) => p.id === activeBust.targetId)?.name ?? activeBust.targetId}
      isLocalPlayer={activeBust.targetId === localPlayerId}
      card={activeBust.card}
      queuePosition={bustQueue.length > 1 ? { index: 1, total: bustQueue.length } : undefined}
      onDismiss={() => setBustQueue((queue) => queue.slice(1))}
    />
  ) : null;

  if (flip.phase === "game-over") {
    const winner = flip.players.find((player) => player.id === flip.winnerId);
    return (
      <>
        {bustNotice}
        <div data-testid="flip-game-over" className="flex flex-col items-center gap-4 p-6 text-center">
          <p className="text-lg font-bold text-ink">{winner ? `${winner.name} wins!` : "Game over"}</p>
          <FlipScoreboard players={toScoreboardPlayers(flip.players)} />
        </div>
      </>
    );
  }

  if (flip.phase === "awaiting-round-start") {
    const isDealer = localPlayerId === flip.dealerId;
    return (
      <>
        {bustNotice}
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
      </>
    );
  }

  const game = toEngineGameState(flip);

  return (
    <>
      {bustNotice}
      <FlipTable
        game={game}
        localPlayerId={localPlayerId}
        onHit={onHit}
        onFreeze={onFreeze}
        // #366's C4 timeout self-targets through these same two callbacks
        // (see FlipTable's own doc comment) — without passing them through,
        // a Freeze/Flip3 target-choice timeout has nothing to call once the
        // deadline below actually expires client-side.
        onChooseFreezeTarget={onChooseFreezeTarget}
        onChooseFlip3Target={onChooseFlip3Target}
        // #394 — the wire field FlipTableView now carries: server-owned,
        // recomputed on every broadcast. This is the fix for the gap #394
        // found: FlipTable's `turnDeadline` prop and the whole countdown
        // hook underneath it were real but permanently `null`, since
        // nothing ever passed a value through this exact spot. The server
        // guarantees the timeout fires regardless of what this prop does;
        // wiring it is only what lets a CONNECTED client also see the
        // countdown and self-target locally the instant it expires, rather
        // than waiting for the server's own re-broadcast to catch up.
        turnDeadline={flip.turnDeadline}
        reconnectingIds={reconnectingIds}
        devToolsEnabled={devToolsEnabled}
        pendingActionUi={
          <PendingActionPicker
            game={game}
            localPlayerId={localPlayerId}
            onChooseFreezeTarget={onChooseFreezeTarget}
            onChooseFlip3Target={onChooseFlip3Target}
          />
        }
      />
    </>
  );
}
