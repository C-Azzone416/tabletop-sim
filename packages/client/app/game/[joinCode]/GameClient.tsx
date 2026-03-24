"use client";

import { useEffect, useRef } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useGameState } from "../../hooks/useGameState";
import { Lobby } from "../../components/Lobby";
import { SetupPhase } from "../../components/SetupPhase";
import { GameBoard } from "../../components/GameBoard";
import { GameOverOverlay } from "../../components/GameOverOverlay";

interface GameClientProps {
  joinCode: string;
}

export function GameClient({ joinCode }: GameClientProps) {
  const { state, handleMessage } = useGameState();
  const { status, connect, send } = useWebSocket(handleMessage);
  const hasConnected = useRef(false);

  useEffect(() => {
    if (!hasConnected.current) {
      hasConnected.current = true;
      connect();
    }
  }, [connect]);

  const gameStatus = state.game?.status;

  // Waiting / Lobby
  if (!state.game || gameStatus === "waiting") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Lobby
          joinCode={joinCode}
          players={state.players}
          localPlayerId={state.localPlayer?.id ?? ""}
          captainId={state.game?.captainId ?? null}
          onStartGame={(mission) => send({ type: "start_game", mission })}
        />
        {state.error && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:bg-red-900/20 dark:text-red-400">
            {state.error}
          </div>
        )}
      </div>
    );
  }

  // Setup phase
  if (gameStatus === "setup") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <SetupPhase
          game={state.game}
          players={state.players}
          wires={state.wires}
          localPlayerId={state.localPlayer?.id ?? ""}
          onPlaceInfoToken={(wireId) =>
            send({ type: "place_info_token", wireId })
          }
        />
      </div>
    );
  }

  // Active game
  if (gameStatus === "active") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <GameBoard
          game={state.game}
          players={state.players}
          wires={state.wires}
          infoTokens={state.infoTokens}
          validationTokens={state.validationTokens}
          localPlayerId={state.localPlayer?.id ?? ""}
          lastTurnResult={state.lastTurnResult}
          onDuoCut={(targetWireId, guessedValue) =>
            send({ type: "duo_cut", targetWireId, guessedValue })
          }
          onSoloCut={(wireValue) => send({ type: "solo_cut", wireValue })}
          onDoubleDetector={(targetWireId, targetWireId2) =>
            send({
              type: "double_detector",
              targetWireId,
              targetWireId2,
            })
          }
        />
        {state.error && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:bg-red-900/20 dark:text-red-400">
            {state.error}
          </div>
        )}
      </div>
    );
  }

  // Game over
  if (gameStatus === "won" || gameStatus === "lost") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <GameBoard
          game={state.game}
          players={state.players}
          wires={state.wires}
          infoTokens={state.infoTokens}
          validationTokens={state.validationTokens}
          localPlayerId={state.localPlayer?.id ?? ""}
          lastTurnResult={state.lastTurnResult}
          onDuoCut={() => {}}
          onSoloCut={() => {}}
          onDoubleDetector={() => {}}
        />
        <GameOverOverlay
          result={gameStatus}
          reason={state.gameOverReason ?? ""}
        />
      </div>
    );
  }

  // Fallback: connecting
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <p className="text-zinc-500 dark:text-zinc-400">
        {status === "connecting"
          ? "Connecting to server..."
          : "Loading game..."}
      </p>
    </div>
  );
}
