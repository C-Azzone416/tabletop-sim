"use client";

import type { Player } from "@tabletop/shared";

interface TurnIndicatorProps {
  currentTurnPlayerId: string | null;
  localPlayerId: string;
  players: Player[];
}

export function TurnIndicator({
  currentTurnPlayerId,
  localPlayerId,
  players,
}: TurnIndicatorProps) {
  const isMyTurn = currentTurnPlayerId === localPlayerId;
  const currentPlayer = players.find((p) => p.id === currentTurnPlayerId);

  return (
    <div
      className={`rounded-lg px-4 py-2 text-center font-medium ${
        isMyTurn
          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {isMyTurn
        ? "Your turn — choose an action"
        : `Waiting for ${currentPlayer?.name ?? "..."}...`}
    </div>
  );
}
