"use client";

import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useGameState } from "../../hooks/useGameState";
import { Lobby } from "../../components/Lobby";
import { SetupPhase } from "../../components/SetupPhase";
import { GameBoard } from "../../components/GameBoard";
import { GameOverOverlay } from "../../components/GameOverOverlay";
import { SeatSwitcher } from "../../components/SeatSwitcher";

export interface DevSeatOption {
  name: string;
  profileId: string;
}

interface GameClientProps {
  joinCode: string;
  profileId: string;
  playerName: string;
  seatOptions?: DevSeatOption[];
}

export function GameClient({ joinCode, profileId, playerName, seatOptions = [] }: GameClientProps) {
  const { state, handleMessage } = useGameState();
  const [activeSeat, setActiveSeat] = useState<DevSeatOption>({ profileId, name: playerName });
  const { status, connect, disconnect, send } = useWebSocket(
    handleMessage,
    activeSeat.profileId,
    activeSeat.name,
  );
  const hasConnected = useRef(false);
  const connectedSeatRef = useRef(activeSeat.profileId);

  useEffect(() => {
    if (!hasConnected.current) {
      hasConnected.current = true;
      connect();
      return;
    }
    // Seat switch: `connect` is only the right (freshly re-bound) closure
    // for `activeSeat` once this effect runs post-render — calling it
    // synchronously from the click handler would still capture the
    // pre-switch identity.
    if (connectedSeatRef.current !== activeSeat.profileId) {
      connectedSeatRef.current = activeSeat.profileId;
      disconnect();
      connect();
    }
  }, [activeSeat, connect, disconnect]);

  const handleSwitchSeat = (seat: DevSeatOption) => {
    if (seat.profileId === activeSeat.profileId) return;
    setActiveSeat(seat);
  };

  const gameStatus = state.game?.status;

  const seatSwitcher = seatOptions.length > 0 && (
    <SeatSwitcher
      seats={seatOptions}
      activeProfileId={activeSeat.profileId}
      onSwitch={handleSwitchSeat}
    />
  );

  const devToolsEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

  const revealAllTokensButton = devToolsEnabled && (
    <button
      onClick={() => {
        fetch(`${serverUrl}/dev/reveal-all-tokens`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinCode }),
        });
      }}
      className="rounded border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-mono text-amber-700 opacity-70 hover:opacity-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
    >
      [DEV] Reveal All Tokens
    </button>
  );

  // Waiting / Lobby
  if (!state.game || gameStatus === "waiting") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Lobby
          joinCode={joinCode}
          players={state.players}
          localPlayerId={state.localPlayer?.id ?? ""}
          captainId={state.game?.captainId ?? null}
          onReady={() => send({ type: "player_ready" })}
          onStartGame={(mission) => send({ type: "start_game", mission })}
        />
        {seatSwitcher}
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
        {seatSwitcher}
        <SetupPhase
          game={state.game}
          players={state.players}
          wires={state.wires}
          infoTokens={state.infoTokens}
          localPlayerId={state.localPlayer?.id ?? ""}
          onPlaceInfoToken={(wireId) =>
            send({ type: "place_info_token", wireId })
          }
        />
        {revealAllTokensButton && (
          <div className="fixed bottom-4 right-4">{revealAllTokensButton}</div>
        )}
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
          pendingDualCut={state.pendingDualCut}
          pendingDualCutCorrect={state.pendingDualCutCorrect}
          onProposeDualCut={(targetWireId, guessedValue) =>
            send({ type: "propose_dual_cut", targetWireId, guessedValue })
          }
          onRespondDualCut={(accepted) =>
            send({ type: "respond_dual_cut", accepted })
          }
          onCompleteDualCut={(ownWireId) =>
            send({ type: "complete_dual_cut", ownWireId })
          }
          onSoloCut={(wireValue) => send({ type: "solo_cut", wireValue })}
          onDoubleDetector={(targetWireId, targetWireId2) =>
            send({
              type: "double_detector",
              targetWireId,
              targetWireId2,
            })
          }
          onRevealReds={() => send({ type: "reveal_reds" })}
        />
        {seatSwitcher}
        {devToolsEnabled && (
          <div className="fixed bottom-4 right-4 flex gap-2">
            {revealAllTokensButton}
            <button
              onClick={() => {
                fetch(`${serverUrl}/dev/advance-turn`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ joinCode }),
                });
              }}
              className="rounded border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-mono text-amber-700 opacity-70 hover:opacity-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
            >
              [DEV] Skip Turn
            </button>
          </div>
        )}
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
          pendingDualCut={state.pendingDualCut}
          pendingDualCutCorrect={state.pendingDualCutCorrect}
          onProposeDualCut={() => {}}
          onRespondDualCut={() => {}}
          onCompleteDualCut={() => {}}
          onSoloCut={() => {}}
          onDoubleDetector={() => {}}
          onRevealReds={() => {}}
        />
        <GameOverOverlay
          result={gameStatus}
          reason={state.gameOverReason ?? ""}
        />
        {seatSwitcher}
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
