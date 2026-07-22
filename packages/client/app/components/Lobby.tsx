"use client";

import { useState } from "react";
import type { Player } from "@tabletop/shared";

const MISSION_DESCRIPTIONS: Record<number, string> = {
  1: "Blue wires only — learn the basics",
  2: "Blue wires, tighter detonator — learn efficiency",
  3: "Yellow wires join the mix",
  4: "More yellow, fewer blue — harder deduction",
  5: "Red wires appear — reveal_reds unlocked",
  6: "More reds, tighter detonator",
  7: "All wire types, all mechanics",
  8: "Final training — tightest detonator",
};

interface LobbyProps {
  joinCode: string;
  players: Player[];
  localPlayerId: string;
  captainId: string | null;
  onReady: () => void;
  onStartGame: (mission: number) => void;
}

export function Lobby({
  joinCode,
  players,
  localPlayerId,
  captainId,
  onReady,
  onStartGame,
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
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Game Lobby
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Join Code:
          </span>
          <code className="rounded bg-zinc-100 px-3 py-1 text-lg font-mono font-bold tracking-widest text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
            {joinCode}
          </code>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Share this code with other players
        </p>
      </div>

      <div className="w-full max-w-sm">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Players ({players.length}/4)
        </h3>
        <ul className="space-y-2">
          {players.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  player.ready ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"
                }`}
                title={player.ready ? "Ready" : "Not ready"}
              />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {player.name}
              </span>
              {player.id === captainId && (
                <span className="ml-auto text-xs font-medium text-amber-600 dark:text-amber-400">
                  Captain
                </span>
              )}
              {player.id === localPlayerId && (
                <span className={player.id === captainId ? "text-xs text-zinc-400" : "ml-auto text-xs text-zinc-400"}>
                  (you)
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isCaptain && (
        <div className="w-full max-w-sm">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Select Mission
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(MISSION_DESCRIPTIONS).map(([num, desc]) => {
              const mission = Number(num);
              const isSelected = selectedMission === mission;
              return (
                <button
                  key={mission}
                  onClick={() => setSelectedMission(mission)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                      : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${
                      isSelected
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    Mission {mission}
                  </span>
                  <p
                    className={`mt-0.5 text-xs ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        {!isLocalPlayerReady && (
          <button
            onClick={onReady}
            className="rounded-full bg-teal-600 px-8 py-3 font-medium text-white transition-colors hover:bg-teal-700"
          >
            Ready
          </button>
        )}

        {isCaptain && isLocalPlayerReady && (
          <button
            onClick={handleStartGame}
            disabled={!canStart || isStarting}
            className="rounded-full bg-green-600 px-8 py-3 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? "Starting..." : `Start Mission ${selectedMission}`}
          </button>
        )}

        {isLocalPlayerReady && !allPlayersReady && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Waiting for {notReadyPlayerNames.join(", ")} to ready up...
          </p>
        )}

        {isLocalPlayerReady && allPlayersReady && !isCaptain && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Waiting for the host to start the game...
          </p>
        )}
      </div>
    </div>
  );
}
