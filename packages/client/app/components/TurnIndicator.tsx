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
          ? "bg-accent/10 text-accent"
          : "bg-surface-raised text-ink-muted"
      }`}
    >
      {isMyTurn
        ? "Your turn — choose an action"
        : `Waiting for ${currentPlayer?.name ?? "..."}...`}
    </div>
  );
}
