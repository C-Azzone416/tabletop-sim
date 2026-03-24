"use client";

import { useState } from "react";
import type { Game, Player, Wire } from "@tabletop/shared";
import { PlayerRack } from "./PlayerRack";

interface SetupPhaseProps {
  game: Game;
  players: Player[];
  wires: Wire[];
  localPlayerId: string;
  onPlaceInfoToken: (wireId: string) => void;
}

export function SetupPhase({
  game,
  players,
  wires,
  localPlayerId,
  onPlaceInfoToken,
}: SetupPhaseProps) {
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);

  const handlePlaceToken = () => {
    if (selectedWireId) {
      onPlaceInfoToken(selectedWireId);
      setSelectedWireId(null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Setup Phase
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Place info tokens on other players&apos; wires. You can see the fronts
          of their wires but not your own.
        </p>
      </div>

      <div className="w-full max-w-4xl space-y-6">
        {players.map((player) => {
          const playerWires = wires
            .filter((w) => w.playerId === player.id)
            .sort((a, b) => a.rackPosition - b.rackPosition);
          const isLocal = player.id === localPlayerId;

          return (
            <div key={player.id}>
              <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {isLocal ? "Your Rack (hidden from you)" : player.name}
              </h3>
              <PlayerRack
                wires={playerWires}
                isLocal={isLocal}
                selectedWireId={selectedWireId}
                onSelectWire={
                  !isLocal ? (id) => setSelectedWireId(id) : undefined
                }
                infoTokens={[]}
              />
            </div>
          );
        })}
      </div>

      {selectedWireId && (
        <button
          onClick={handlePlaceToken}
          className="rounded-full bg-amber-500 px-6 py-2 font-medium text-white transition-colors hover:bg-amber-600"
        >
          Place Info Token
        </button>
      )}
    </div>
  );
}
