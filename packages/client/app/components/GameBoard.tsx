"use client";

import type {
  Game,
  Player,
  Wire,
  InfoToken,
  ValidationToken,
  ServerMessage,
} from "@tabletop/shared";
import { PlayerRack } from "./PlayerRack";
import { Detonator } from "./Detonator";
import { ValidationTracker } from "./ValidationTracker";
import { TurnIndicator } from "./TurnIndicator";
import { ActionPanel } from "./ActionPanel";

interface GameBoardProps {
  game: Game;
  players: Player[];
  wires: Wire[];
  infoTokens: InfoToken[];
  validationTokens: ValidationToken[];
  localPlayerId: string;
  lastTurnResult: Extract<ServerMessage, { type: "turn_result" }> | null;
  onDuoCut: (targetWireId: string, guessedValue: string) => void;
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
  onDuoCut,
  onSoloCut,
  onDoubleDetector,
}: GameBoardProps) {
  const isMyTurn = game.currentTurnPlayerId === localPlayerId;
  const localPlayer = players.find((p) => p.id === localPlayerId);

  // Sort players: local player last so they appear at bottom
  const sortedPlayers = [
    ...players.filter((p) => p.id !== localPlayerId),
    ...players.filter((p) => p.id === localPlayerId),
  ];

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
          <Detonator
            position={game.detonatorPosition}
            max={game.detonatorMax}
          />
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

      {/* Player racks */}
      <div className="space-y-4">
        {sortedPlayers.map((player) => {
          const playerWires = wires
            .filter((w) => w.playerId === player.id)
            .sort((a, b) => a.rackPosition - b.rackPosition);
          const isLocal = player.id === localPlayerId;

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
                selectedWireId={null}
                infoTokens={infoTokens.filter((t) =>
                  playerWires.some((w) => w.id === t.wireId)
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Action panel */}
      <ActionPanel
        isMyTurn={isMyTurn}
        players={players}
        wires={wires}
        localPlayerId={localPlayerId}
        doubleDetectorUsed={localPlayer?.doubleDetectorUsed ?? false}
        onDuoCut={onDuoCut}
        onSoloCut={onSoloCut}
        onDoubleDetector={onDoubleDetector}
      />
    </div>
  );
}
