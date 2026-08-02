"use client";

import { useState } from "react";
import type {
  Game,
  Player,
  Wire,
  InfoToken,
  ValidationToken,
  ServerMessage,
} from "@tabletop/shared";
import { PlayerRack } from "./PlayerRack";
import { ValidationTracker } from "./ValidationTracker";
import { TurnIndicator } from "./TurnIndicator";
import { ActionPanel, type ActionMode } from "./ActionPanel";

interface GameBoardProps {
  game: Game;
  players: Player[];
  wires: Wire[];
  infoTokens: InfoToken[];
  validationTokens: ValidationToken[];
  localPlayerId: string;
  lastTurnResult: Extract<ServerMessage, { type: "turn_result" }> | null;
  pendingDualCut: Extract<ServerMessage, { type: "dual_cut_proposed" }> | null;
  pendingDualCutCorrect: Extract<ServerMessage, { type: "dual_cut_correct" }> | null;
  onProposeDualCut: (targetWireId: string, guessedValue: string) => void;
  onRespondDualCut: (accepted: boolean) => void;
  onCompleteDualCut: (ownWireId: string) => void;
  onSoloCut: (wireValue: string) => void;
  onDoubleDetector: (targetWireId: string, targetWireId2: string) => void;
  onRevealReds: () => void;
}

export function GameBoard({
  game,
  players,
  wires,
  infoTokens,
  validationTokens,
  localPlayerId,
  lastTurnResult,
  pendingDualCut,
  pendingDualCutCorrect,
  onProposeDualCut,
  onRespondDualCut,
  onCompleteDualCut,
  onSoloCut,
  onDoubleDetector,
  onRevealReds,
}: GameBoardProps) {
  const isMyTurn = game.currentTurnPlayerId === localPlayerId;
  const localPlayer = players.find((p) => p.id === localPlayerId);

  const [actionMode, setActionMode] = useState<ActionMode>("idle");

  // Step 1: dual cut — which wire was clicked + guess popup state
  const [dualCutWireId, setDualCutWireId] = useState<string | null>(null);
  const [dualCutGuess, setDualCutGuess] = useState("");
  const [dualCutGuessOpen, setDualCutGuessOpen] = useState(false);

  // Solo Cut: up to 2 selected wire IDs
  const [soloCutSelected, setSoloCutSelected] = useState<string[]>([]);

  const resetAction = () => {
    setActionMode("idle");
    setDualCutWireId(null);
    setDualCutGuess("");
    setDualCutGuessOpen(false);
    setSoloCutSelected([]);
  };

  // Step 1: proposer clicks an opponent wire tile → open guess popup
  const handleOpponentWireClick = (wireId: string) => {
    setDualCutWireId(wireId);
    setDualCutGuess("");
    setDualCutGuessOpen(true);
  };

  const handleDualCutGuessSubmit = () => {
    if (dualCutWireId && dualCutGuess.trim()) {
      onProposeDualCut(dualCutWireId, dualCutGuess.trim());
      resetAction();
    }
  };

  const handleDualCutGuessCancel = () => {
    setDualCutWireId(null);
    setDualCutGuess("");
    setDualCutGuessOpen(false);
  };

  // Solo Cut handlers
  const handleOwnWireClick = (wireId: string) => {
    setSoloCutSelected((prev) => {
      if (prev.includes(wireId)) return prev.filter((id) => id !== wireId);
      if (prev.length >= 2) return prev;
      return [...prev, wireId];
    });
  };

  const soloCutMatchStatus = (): "idle" | "valid" | "mismatch" => {
    if (soloCutSelected.length < 2) return "idle";
    const w1 = wires.find((w) => w.id === soloCutSelected[0]);
    const w2 = wires.find((w) => w.id === soloCutSelected[1]);
    if (w1?.value != null && w1.value === w2?.value) return "valid";
    return "mismatch";
  };

  const handleSoloCutConfirm = () => {
    if (soloCutSelected.length === 2 && soloCutMatchStatus() === "valid") {
      const w = wires.find((w) => w.id === soloCutSelected[0]);
      if (w?.value != null) {
        onSoloCut(String(w.value));
        resetAction();
      }
    }
  };

  // Dual cut state derivations
  const isProposer = pendingDualCut?.proposingPlayerId === localPlayerId;
  const isTarget = pendingDualCut?.targetPlayerId === localPlayerId;
  const pendingTargetPlayer = pendingDualCut
    ? players.find((p) => p.id === pendingDualCut.targetPlayerId)
    : null;
  const pendingProposerPlayer = pendingDualCut
    ? players.find((p) => p.id === pendingDualCut.proposingPlayerId)
    : null;
  const dualCutTargetWire = dualCutWireId
    ? wires.find((w) => w.id === dualCutWireId)
    : null;
  const dualCutTargetOwner = dualCutTargetWire
    ? players.find((p) => p.id === dualCutTargetWire.playerId)
    : null;

  // Step 3: proposer picks own wire after correct guess
  const isCompletingDualCut = !!(pendingDualCutCorrect && isProposer);
  const localWires = wires
    .filter((w) => w.playerId === localPlayerId && w.status === "hidden")
    .sort((a, b) => a.rackPosition - b.rackPosition);

  // Hide action panel while a dual cut is in flight (pending or completing)
  const dualCutInFlight = !!(pendingDualCut || isCompletingDualCut);

  return (
    // pt-14 clears the fixed JoinCodeBadge (top-4 left-4) — GameClient
    // renders it as a sibling overlay, so this content needs enough top
    // clearance on its own; the tighter gap-3/p-3 elsewhere is #159's
    // density pass (action panel visible without scrolling).
    <div className="flex flex-col gap-3 p-3 pt-14">
      {/* Status bar */}
      <div className="grid grid-cols-3 items-center gap-4">
        <TurnIndicator
          currentTurnPlayerId={game.currentTurnPlayerId}
          localPlayerId={localPlayerId}
          players={players}
        />
        <div className="flex justify-center">
          <ValidationTracker
            validationTokens={validationTokens}
            missionNumber={game.mission}
          />
        </div>
        <div className="flex justify-end">
          <DetonatorDisplay
            position={game.detonatorPosition}
            max={game.detonatorMax}
          />
        </div>
      </div>

      {/* Last turn result */}
      {lastTurnResult && (
        <div
          className={`rounded-cab px-4 py-2 text-center text-sm ${
            lastTurnResult.turn.result === "success"
              ? "bg-success/10 text-success"
              : lastTurnResult.turn.result === "fail"
                ? "bg-warning/20 text-warning-ink"
                : "bg-danger/10 text-danger"
          }`}
        >
          {lastTurnResult.turn.result === "success" && "Wire cut successfully!"}
          {lastTurnResult.turn.result === "fail" &&
            "Wrong guess — detonator advances!"}
          {lastTurnResult.turn.result === "explosion" && "BOOM!"}
        </div>
      )}

      {/* Dual cut: waiting indicator for proposer while owner responds */}
      {pendingDualCut && isProposer && !pendingDualCutCorrect && pendingTargetPlayer && (
        <div className="rounded-cab bg-info/10 px-4 py-3 text-center text-sm text-info">
          Waiting for {pendingTargetPlayer.name} to respond to your guess…
        </div>
      )}

      {/* Player racks — fixed seat order, not local-player-first (#148):
          matches SetupPhase's existing layout so switching seats via the
          dev panel doesn't rearrange the board differently between phases.
          "Your Rack" / player name labeling below still reflects whichever
          seat is currently selected. */}
      <div className="space-y-2">
        {players.map((player) => {
          const playerWires = wires
            .filter((w) => w.playerId === player.id)
            .sort((a, b) => a.rackPosition - b.rackPosition);
          const isLocal = player.id === localPlayerId;

          const isDualCutTarget = !isLocal && isMyTurn && actionMode === "dual_cut";
          const isSoloCutLocal = isLocal && isMyTurn && actionMode === "solo_cut";

          const dualCutSelectableIds = isDualCutTarget
            ? playerWires.filter((w) => w.status === "hidden").map((w) => w.id)
            : undefined;

          const soloCutSelectableIds = isSoloCutLocal
            ? playerWires.filter((w) => w.value !== null && w.status === "hidden").map((w) => w.id)
            : undefined;

          // Highlight the pending dual cut target wire
          const pendingDualCutSelectedId =
            pendingDualCut && player.id === pendingDualCut.targetPlayerId
              ? pendingDualCut.targetWireId
              : null;

          const isActiveTurn = player.id === game.currentTurnPlayerId;

          return (
            <div key={player.id}>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={
                    isLocal
                      ? "text-base font-bold text-accent"
                      : "text-sm font-medium text-ink-muted"
                  }
                >
                  {isLocal ? "You" : player.name}
                </span>
                {player.id === game.captainId && (
                  <span className="text-xs text-ink-muted">Captain</span>
                )}
                {/* #159 item 3: active-turn flag must be unmistakable — solid
                    fill rather than a light tint, since whose-turn-it-is is
                    exactly the ambiguity #149 filed against. --warning is the
                    platform's active-turn/active-seat color (DESIGN-APPENDIX
                    §7 seat chip rules). */}
                {isActiveTurn && (
                  <span className="rounded-cab bg-warning px-2 py-0.5 text-xs font-semibold text-warning-ink shadow-print-sm">
                    Active
                  </span>
                )}
              </div>
              <PlayerRack
                wires={playerWires}
                isLocal={isLocal}
                selectedWireId={pendingDualCutSelectedId ?? (isDualCutTarget ? dualCutWireId : null)}
                selectedWireIds={isSoloCutLocal ? soloCutSelected : undefined}
                selectableWireIds={dualCutSelectableIds ?? soloCutSelectableIds}
                onSelectWire={
                  isDualCutTarget
                    ? handleOpponentWireClick
                    : isSoloCutLocal
                      ? handleOwnWireClick
                      : undefined
                }
                infoTokens={infoTokens.filter((t) =>
                  playerWires.some((w) => w.id === t.wireId)
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Action panel — hidden while a dual cut is in flight */}
      {!dualCutInFlight && (
        <ActionPanel
          isMyTurn={isMyTurn}
          players={players}
          wires={wires}
          localPlayerId={localPlayerId}
          doubleDetectorUsed={localPlayer?.doubleDetectorUsed ?? false}
          hasRedWires={game.mission >= 5}
          mode={actionMode}
          onSetMode={setActionMode}
          onCancel={resetAction}
          soloCutSelectedCount={soloCutSelected.length}
          soloCutMatchStatus={soloCutMatchStatus()}
          onSoloCutConfirm={handleSoloCutConfirm}
          onDoubleDetector={onDoubleDetector}
          onRevealReds={onRevealReds}
        />
      )}

      {/* Step 1: Dual Cut guess popup (proposer enters value guess) */}
      {dualCutGuessOpen && dualCutTargetWire && dualCutTargetOwner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleDualCutGuessCancel}
        >
          <div
            className="w-80 rounded-cab border-2 border-outline bg-surface-raised p-6 shadow-print-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-base font-semibold text-ink">Dual Cut</h2>
            <p className="mb-4 text-sm text-ink-muted">
              Guess the value of {dualCutTargetOwner.name}&apos;s wire #
              {dualCutTargetWire.rackPosition}.
            </p>
            <input
              type="text"
              value={dualCutGuess}
              onChange={(e) => setDualCutGuess(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDualCutGuessSubmit()}
              placeholder="Enter value…"
              autoFocus
              className="mb-4 w-full rounded-cab border-2 border-outline bg-surface px-3 py-2 text-sm text-ink focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDualCutGuessCancel}
                className="press flex-1 rounded-cab border-2 border-outline bg-surface-raised px-4 py-2 text-sm font-bold text-ink shadow-print-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDualCutGuessSubmit}
                disabled={!dualCutGuess.trim()}
                className="press flex-1 rounded-cab border-2 border-outline bg-accent px-4 py-2 text-sm font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
              >
                Propose Cut
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Owner confirm/deny popup */}
      {isTarget && pendingDualCut && !pendingDualCutCorrect && pendingProposerPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-cab border-2 border-outline bg-surface-raised p-6 shadow-print-md">
            <h2 className="mb-1 text-base font-semibold text-ink">
              Dual Cut — Incoming Guess
            </h2>
            <p className="mb-6 text-sm text-ink-muted">
              {pendingProposerPlayer.name} guesses your wire #
              {pendingDualCut.targetWireRackPosition} has value{" "}
              <span className="font-semibold text-ink">
                {pendingDualCut.guessedValue}
              </span>
              . Is that correct?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onRespondDualCut(false)}
                className="press flex-1 rounded-cab border-2 border-danger px-4 py-2 text-sm font-bold text-danger hover:bg-danger/10"
              >
                No
              </button>
              <button
                onClick={() => onRespondDualCut(true)}
                className="press flex-1 rounded-cab border-2 border-outline bg-accent px-4 py-2 text-sm font-bold text-accent-ink shadow-print-sm"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Proposer picks own matching wire after correct guess */}
      {isCompletingDualCut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-cab border-2 border-outline bg-surface-raised p-6 shadow-print-md">
            <h2 className="mb-1 text-base font-semibold text-ink">
              Correct Guess!
            </h2>
            <p className="mb-4 text-sm text-ink-muted">
              Pick a matching wire from your rack to cut both.
            </p>
            <div className="flex flex-wrap gap-2">
              {localWires.map((w) => (
                <button
                  key={w.id}
                  onClick={() => onCompleteDualCut(w.id)}
                  className="press rounded-cab border-2 border-outline px-3 py-2 text-sm text-ink hover:border-accent hover:bg-accent/10"
                >
                  Wire #{w.rackPosition}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetonatorDisplay({
  position,
  max,
}: {
  position: number;
  max: number;
}) {
  // #143 (Caroline, 2026-07-23): lives count DOWN in the UI — players start
  // with `max` lives and lose one per wrong guess, reaching 0 = loss. The
  // internal model (detonatorPosition counting up to detonatorMax) is
  // mathematically identical, so this is a display-only transform; nothing
  // server-side changes.
  const livesRemaining = max - position;
  const urgent = livesRemaining <= 1;
  const warning = !urgent && livesRemaining <= Math.floor(max / 2);

  const colorClass = urgent
    ? "text-danger font-bold"
    : warning
      ? "text-warning-ink"
      : "text-ink-muted";

  return (
    <div className="flex flex-col items-center gap-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
        Lives
      </h3>
      <span className={`text-sm tabular-nums ${colorClass}`}>
        {livesRemaining} / {max}
      </span>
    </div>
  );
}
