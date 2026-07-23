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
    <div className="flex flex-col gap-6 p-6">
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
          className={`rounded-lg px-4 py-2 text-center text-sm ${
            lastTurnResult.turn.result === "success"
              ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300"
              : lastTurnResult.turn.result === "fail"
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
                : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300"
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
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-center text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
          Waiting for {pendingTargetPlayer.name} to respond to your guess…
        </div>
      )}

      {/* Player racks — fixed seat order, not local-player-first (#148):
          matches SetupPhase's existing layout so switching seats via the
          dev panel doesn't rearrange the board differently between phases.
          "Your Rack" / player name labeling below still reflects whichever
          seat is currently selected. */}
      <div className="space-y-4">
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

          return (
            <div key={player.id}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    isLocal
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {isLocal ? "You" : player.name}
                </span>
                {player.id === game.captainId && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Captain
                  </span>
                )}
                {player.id === game.currentTurnPlayerId && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
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
            className="w-80 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Dual Cut
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
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
              className="mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDualCutGuessCancel}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDualCutGuessSubmit}
                disabled={!dualCutGuess.trim()}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
          <div className="w-80 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Dual Cut — Incoming Guess
            </h2>
            <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
              {pendingProposerPlayer.name} guesses your wire #
              {pendingDualCut.targetWireRackPosition} has value{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {pendingDualCut.guessedValue}
              </span>
              . Is that correct?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onRespondDualCut(false)}
                className="flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                No
              </button>
              <button
                onClick={() => onRespondDualCut(true)}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
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
          <div className="w-80 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Correct Guess!
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Pick a matching wire from your rack to cut both.
            </p>
            <div className="flex flex-wrap gap-2">
              {localWires.map((w) => (
                <button
                  key={w.id}
                  onClick={() => onCompleteDualCut(w.id)}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:border-blue-500 hover:bg-blue-50 dark:border-zinc-600 dark:hover:border-blue-400 dark:hover:bg-blue-900/20"
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
    ? "text-red-600 dark:text-red-400 font-bold"
    : warning
      ? "text-amber-600 dark:text-amber-400"
      : "text-zinc-500 dark:text-zinc-400";

  return (
    <div className="flex flex-col items-center gap-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Lives
      </h3>
      <span className={`text-sm tabular-nums ${colorClass}`}>
        {livesRemaining} / {max}
      </span>
    </div>
  );
}
