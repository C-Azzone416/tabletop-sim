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
  pendingDuoCut: Extract<ServerMessage, { type: "duo_cut_proposed" }> | null;
  onProposeDuoCut: (targetWireId: string) => void;
  onRespondDuoCut: (accepted: boolean) => void;
  onSoloCut: (wireValue: string) => void;
  onDoubleDetector: (targetWireId: string, targetWireId2: string) => void;
}

export function GameBoard({
  game,
  players,
  wires,
  infoTokens,
  validationTokens,
  localPlayerId,
  lastTurnResult,
  pendingDuoCut,
  onProposeDuoCut,
  onRespondDuoCut,
  onSoloCut,
  onDoubleDetector,
}: GameBoardProps) {
  const isMyTurn = game.currentTurnPlayerId === localPlayerId;
  const localPlayer = players.find((p) => p.id === localPlayerId);

  // Action mode state lifted here so board tiles can respond
  const [actionMode, setActionMode] = useState<ActionMode>("idle");

  // Duo Cut: selected opponent wire + confirmation modal
  const [duoCutWireId, setDuoCutWireId] = useState<string | null>(null);
  const [duoCutModalOpen, setDuoCutModalOpen] = useState(false);

  // Solo Cut: up to 2 selected wire IDs
  const [soloCutSelected, setSoloCutSelected] = useState<string[]>([]);

  const resetAction = () => {
    setActionMode("idle");
    setDuoCutWireId(null);
    setDuoCutModalOpen(false);
    setSoloCutSelected([]);
  };

  // Duo Cut — proposer flow
  const handleOpponentWireClick = (wireId: string) => {
    setDuoCutWireId(wireId);
    setDuoCutModalOpen(true);
  };

  const handleDuoCutConfirm = () => {
    if (duoCutWireId) {
      onProposeDuoCut(duoCutWireId);
      resetAction();
    }
  };

  const handleDuoCutModalCancel = () => {
    setDuoCutWireId(null);
    setDuoCutModalOpen(false);
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

  // Sort players: local player first
  const sortedPlayers = [
    ...players.filter((p) => p.id === localPlayerId),
    ...players.filter((p) => p.id !== localPlayerId),
  ];

  // Duo cut modal target wire info
  const duoCutTargetWire = duoCutWireId
    ? wires.find((w) => w.id === duoCutWireId)
    : null;
  const duoCutTargetOwner = duoCutTargetWire
    ? players.find((p) => p.id === duoCutTargetWire.playerId)
    : null;

  // Pending duo cut state (from server broadcast)
  const isProposer = pendingDuoCut?.proposingPlayerId === localPlayerId;
  const isTarget = pendingDuoCut?.targetPlayerId === localPlayerId;
  const pendingTargetPlayer = pendingDuoCut
    ? players.find((p) => p.id === pendingDuoCut.targetPlayerId)
    : null;
  const pendingProposerPlayer = pendingDuoCut
    ? players.find((p) => p.id === pendingDuoCut.proposingPlayerId)
    : null;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TurnIndicator
          currentTurnPlayerId={game.currentTurnPlayerId}
          localPlayerId={localPlayerId}
          players={players}
        />
        <div className="flex gap-6">
          <ValidationTracker validationTokens={validationTokens} />
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

      {/* Waiting indicator for duo cut proposer */}
      {isProposer && pendingTargetPlayer && (
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-center text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
          Waiting for {pendingTargetPlayer.name} to respond to your cut…
        </div>
      )}

      {/* Player racks */}
      <div className="space-y-4">
        {sortedPlayers.map((player) => {
          const playerWires = wires
            .filter((w) => w.playerId === player.id)
            .sort((a, b) => a.rackPosition - b.rackPosition);
          const isLocal = player.id === localPlayerId;

          const isDuoCutTarget = !isLocal && isMyTurn && actionMode === "duo_cut";
          const isSoloCutLocal = isLocal && isMyTurn && actionMode === "solo_cut";

          const duoCutSelectableIds = isDuoCutTarget
            ? playerWires.filter((w) => w.status === "hidden").map((w) => w.id)
            : undefined;

          const soloCutSelectableIds = isSoloCutLocal
            ? playerWires.filter((w) => w.value !== null && w.status === "hidden").map((w) => w.id)
            : undefined;

          // Keep the pending duo cut wire highlighted on target's rack
          const pendingSelectedId =
            pendingDuoCut && player.id === pendingDuoCut.targetPlayerId
              ? pendingDuoCut.targetWireId
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
                selectedWireId={
                  pendingSelectedId ?? (isDuoCutTarget ? duoCutWireId : null)
                }
                selectedWireIds={isSoloCutLocal ? soloCutSelected : undefined}
                selectableWireIds={duoCutSelectableIds ?? soloCutSelectableIds}
                onSelectWire={
                  isDuoCutTarget
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

      {/* Action panel — hidden while a duo cut is pending */}
      {!pendingDuoCut && (
        <ActionPanel
          isMyTurn={isMyTurn}
          players={players}
          wires={wires}
          localPlayerId={localPlayerId}
          doubleDetectorUsed={localPlayer?.doubleDetectorUsed ?? false}
          mode={actionMode}
          onSetMode={setActionMode}
          onCancel={resetAction}
          soloCutSelectedCount={soloCutSelected.length}
          soloCutMatchStatus={soloCutMatchStatus()}
          onSoloCutConfirm={handleSoloCutConfirm}
          onDoubleDetector={onDoubleDetector}
        />
      )}

      {/* Duo Cut confirmation modal (proposer selects wire) */}
      {duoCutModalOpen && duoCutTargetWire && duoCutTargetOwner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleDuoCutModalCancel}
        >
          <div
            className="w-80 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Duo Cut
            </h2>
            <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
              Cut {duoCutTargetOwner.name}&apos;s wire #
              {duoCutTargetWire.rackPosition + 1}?{" "}
              {duoCutTargetOwner.name} will need to confirm.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDuoCutModalCancel}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDuoCutConfirm}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Confirm Cut
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duo Cut respond popup (target player) */}
      {isTarget && pendingDuoCut && pendingProposerPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Incoming Cut
            </h2>
            <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
              {pendingProposerPlayer.name} wants to cut your wire #
              {pendingDuoCut.targetWireRackPosition + 1}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onRespondDuoCut(false)}
                className="flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Reject
              </button>
              <button
                onClick={() => onRespondDuoCut(true)}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
