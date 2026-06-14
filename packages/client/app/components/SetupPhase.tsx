"use client";

import { useState } from "react";
import type { Game, Player, Wire, InfoToken, ServerMessage } from "@tabletop/shared";
import { PlayerRack } from "./PlayerRack";

interface SetupPhaseProps {
  game: Game;
  players: Player[];
  wires: Wire[];
  infoTokens: InfoToken[];
  localPlayerId: string;
  onPlaceInfoToken: (wireId: string) => void;
  onSelectOpponentWire: (wireId: string) => void;
  onAnswerWireQuestion: (answer: 'yes' | 'no') => void;
  onNextTurn: () => void;
  onStartGame: () => void;
  pendingWireQuestion: Extract<ServerMessage, { type: "wire_question" }> | null;
  lastInterrogationResult: Extract<ServerMessage, { type: "interrogation_result" }> | null;
}

export function SetupPhase({
  game,
  players,
  wires,
  infoTokens,
  localPlayerId,
  onPlaceInfoToken,
  onSelectOpponentWire,
  onAnswerWireQuestion,
  onNextTurn,
  onStartGame,
  pendingWireQuestion,
  lastInterrogationResult,
}: SetupPhaseProps) {
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const isLocalPlayerActive = game.currentTurnPlayerId === localPlayerId;
  const isLocalPlayerCaptain = game.captainId === localPlayerId;
  const activePlayer = players.find((p) => p.id === game.currentTurnPlayerId);

  const localWireIds = new Set(
    wires.filter((w) => w.playerId === localPlayerId).map((w) => w.id)
  );
  const hasPlacedOpeningToken = infoTokens.some((t) => localWireIds.has(t.wireId));

  const handleSelectOpponentWire = (wireId: string) => {
    setSelectedWireId(wireId);
    onSelectOpponentWire(wireId);
    setSelectedWireId(null);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Setup Phase - Wire Interrogation
        </h2>

        {/* Turn Indicator */}
        <div className="mt-3 rounded-lg bg-blue-100 px-4 py-2 dark:bg-blue-900">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            {isLocalPlayerActive
              ? "Your Turn - Select an opponent's wire"
              : `Waiting for ${activePlayer?.name ?? "..."}...`}
          </p>
        </div>
      </div>

      <div className="w-full max-w-4xl space-y-6">
        {players.map((player) => {
          const playerWires = wires
            .filter((w) => w.playerId === player.id)
            .sort((a, b) => a.rackPosition - b.rackPosition);
          const isLocal = player.id === localPlayerId;
          const canSelectOpponentWires = isLocalPlayerActive && !isLocal;
          const canPlaceOpeningToken = isLocal && !hasPlacedOpeningToken;
          const selectableWireIds = canPlaceOpeningToken
            ? playerWires.filter((w) => w.color === "blue").map((w) => w.id)
            : undefined;

          return (
            <div key={player.id}>
              <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {isLocal ? "Your Rack" : player.name}
              </h3>
              {isLocal && (
                <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                  {hasPlacedOpeningToken
                    ? "Opening info token placed."
                    : "Select one of your blue wires to place your opening info token."}
                </p>
              )}
              <PlayerRack
                wires={playerWires}
                isLocal={isLocal}
                selectedWireId={selectedWireId}
                selectableWireIds={selectableWireIds}
                onSelectWire={
                  canSelectOpponentWires
                    ? handleSelectOpponentWire
                    : canPlaceOpeningToken
                    ? onPlaceInfoToken
                    : undefined
                }
                infoTokens={infoTokens}
              />
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {isLocalPlayerActive && (
          <button
            onClick={onNextTurn}
            disabled={!lastInterrogationResult}
            className="rounded-lg bg-green-600 px-6 py-2 font-medium text-white transition-colors disabled:opacity-50 hover:bg-green-700 disabled:hover:bg-green-600"
          >
            Next Turn
          </button>
        )}

        {isLocalPlayerCaptain && (
          <button
            onClick={onStartGame}
            disabled={!hasPlacedOpeningToken}
            className="rounded-lg bg-purple-600 px-6 py-2 font-medium text-white transition-colors disabled:opacity-50 hover:bg-purple-700 disabled:hover:bg-purple-600"
          >
            Start Game
          </button>
        )}
      </div>

      {/* Wire Question Popup */}
      {pendingWireQuestion && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-800">
            <p className="mb-4 text-center text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {pendingWireQuestion.askerPlayerId === localPlayerId
                ? "Opponent is answering your question..."
                : `${
                    players.find((p) => p.id === pendingWireQuestion.askerPlayerId)
                      ?.name
                  } asks: Is this a ${pendingWireQuestion.wireValue}?`}
            </p>

            {pendingWireQuestion.askerPlayerId !== localPlayerId && (
              <div className="flex gap-3">
                <button
                  onClick={() => onAnswerWireQuestion('yes')}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700"
                >
                  Yes
                </button>
                <button
                  onClick={() => onAnswerWireQuestion('no')}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700"
                >
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interrogation Result Popup */}
      {lastInterrogationResult && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-800">
            <p
              className={`mb-4 text-center text-lg font-semibold ${
                lastInterrogationResult.success
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {lastInterrogationResult.message}
            </p>
            {isLocalPlayerActive && (
              <button
                onClick={onNextTurn}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
              >
                Continue to Next Turn
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
