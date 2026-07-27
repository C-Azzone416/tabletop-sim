"use client";

import { useState } from "react";
import type { Player } from "@tabletop/shared";
import { MissionSelector } from "./MissionSelector";

interface LobbyProps {
  joinCode: string;
  players: Player[];
  localPlayerId: string;
  captainId: string | null;
  onReady: () => void;
  onStartGame: (mission: number) => void;
  // #179: {1..highestUnlocked} are pickable for the captain.
  highestUnlocked: number;
}

export function Lobby({
  joinCode,
  players,
  localPlayerId,
  captainId,
  onReady,
  onStartGame,
  highestUnlocked,
}: LobbyProps) {
  const isCaptain = localPlayerId === captainId;
  const localPlayer = players.find((p) => p.id === localPlayerId);
  const isLocalPlayerReady = localPlayer?.ready ?? false;
  const allPlayersReady = players.every((p) => p.ready);
  const notReadyPlayerNames = players.filter((p) => !p.ready).map((p) => p.name);
  const canStart = players.length >= 1 && players.length <= 4 && allPlayersReady;
  const [selectedMission, setSelectedMission] = useState(1);
  const [isStarting, setIsStarting] = useState(false);

  const handleStartGame = () => {
    if (isStarting) return;
    setIsStarting(true);
    onStartGame(selectedMission);
  };

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-ink">
          Game Lobby
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="text-sm text-ink-muted">
            Join Code:
          </span>
          <code className="rounded-cab bg-surface-raised px-3 py-1 text-lg font-mono font-bold tracking-widest text-ink">
            {joinCode}
          </code>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Share this code with other players
        </p>
      </div>

      <div className="w-full max-w-sm">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
          Players ({players.length}/4)
        </h3>
        <ul className="space-y-2">
          {players.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-3 rounded-cab border-2 border-outline bg-surface-raised px-4 py-3"
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  player.ready ? "bg-success" : "bg-line-soft"
                }`}
                title={player.ready ? "Ready" : "Not ready"}
              />
              <span className="font-medium text-ink">
                {player.name}
              </span>
              {player.id === captainId && (
                <span className="ml-auto rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-ink">
                  Captain
                </span>
              )}
              {player.id === localPlayerId && (
                <span className={player.id === captainId ? "text-xs text-ink-muted" : "ml-auto text-xs text-ink-muted"}>
                  (you)
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isCaptain && (
        <div className="w-full max-w-sm">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
            Select Mission
          </h3>
          <MissionSelector
            selectedMission={selectedMission}
            onSelectMission={setSelectedMission}
            highestUnlocked={highestUnlocked}
          />
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        {!isLocalPlayerReady && (
          <button
            onClick={onReady}
            className="press min-h-11 rounded-cab border-2 border-outline bg-accent px-8 py-3 font-bold text-accent-ink shadow-print-sm"
          >
            Ready
          </button>
        )}

        {isCaptain && isLocalPlayerReady && (
          <button
            onClick={handleStartGame}
            disabled={!canStart || isStarting}
            className="press min-h-11 rounded-cab border-2 border-outline bg-accent px-8 py-3 font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
          >
            {isStarting ? "Starting..." : `Start Mission ${selectedMission}`}
          </button>
        )}

        {isLocalPlayerReady && !allPlayersReady && (
          <p className="text-sm text-ink-muted">
            Waiting for {notReadyPlayerNames.join(", ")} to ready up...
          </p>
        )}

        {isLocalPlayerReady && allPlayersReady && !isCaptain && (
          <p className="text-sm text-ink-muted">
            Waiting for the host to start the game...
          </p>
        )}
      </div>
    </div>
  );
}
