"use client";

import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useGameState } from "../../hooks/useGameState";
import { Lobby } from "../../components/Lobby";
import { SetupPhase } from "../../components/SetupPhase";
import { GameBoard } from "../../components/GameBoard";
import { GameOverOverlay } from "../../components/GameOverOverlay";
import { DevPanel } from "../../components/DevPanel";
import { ErrorToast } from "../../components/ErrorToast";
import { JoinCodeBadge } from "../../components/JoinCodeBadge";
import { SpadesLobby } from "../../components/spades/SpadesLobby";
import { SpadesTable } from "../../components/spades/SpadesTable";

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
  const { state, handleMessage, clearError } = useGameState();
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
  const currentTurnPlayerId = state.game?.currentTurnPlayerId;
  const prevGameStatusRef = useRef(gameStatus);

  // #149: setup→active previously stranded the dev tester on whatever seat
  // they last placed a token as — active play starts on the captain's turn,
  // which is rarely the last placer. Auto-follow the turn holder across
  // that one transition so the tester isn't left viewing a seat with no
  // action buttons and no visible explanation why.
  useEffect(() => {
    const prevStatus = prevGameStatusRef.current;
    prevGameStatusRef.current = gameStatus;

    if (prevStatus !== "setup" || gameStatus !== "active") return;
    if (seatOptions.length === 0 || !currentTurnPlayerId) return;

    const turnHolderPlayer = state.players.find((p) => p.id === currentTurnPlayerId);
    const turnHolderSeat = turnHolderPlayer
      ? seatOptions.find((s) => s.name === turnHolderPlayer.name)
      : undefined;

    if (turnHolderSeat) {
      handleSwitchSeat(turnHolderSeat);
    }
    // Only re-derive on the transition itself — re-running this on every
    // currentTurnPlayerId change would fight the player's own manual
    // seat switches during normal active play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStatus]);

  const devToolsEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

  const revealAllTokens = () => {
    fetch(`${serverUrl}/dev/reveal-all-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode }),
    });
  };

  const skipTurn = () => {
    fetch(`${serverUrl}/dev/advance-turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode }),
    });
  };

  function devPanel(options: { canRevealTokens?: boolean; canSkipTurn?: boolean } = {}) {
    if (!devToolsEnabled) return null;
    return (
      <DevPanel
        seatOptions={seatOptions}
        activeProfileId={activeSeat.profileId}
        onSwitchSeat={handleSwitchSeat}
        onRevealAllTokens={options.canRevealTokens ? revealAllTokens : undefined}
        onSkipTurn={options.canSkipTurn ? skipTurn : undefined}
      />
    );
  }

  if (state.game?.gameType === "spades") {
    if (gameStatus === "waiting") {
      return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
          <SpadesLobby
            joinCode={joinCode}
            players={state.players}
            localPlayerId={state.localPlayer?.id ?? ""}
            captainId={state.game.captainId}
            onReady={() => send({ type: "player_ready" })}
            onStart={(targetScore, botDifficulties) =>
              send({ type: "start_spades", targetScore, botDifficulties })
            }
          />
          <ErrorToast message={state.error} onDismiss={clearError} />
        </div>
      );
    }

    if (state.spadesView && state.spadesSeat) {
      return (
        <div className="relative min-h-screen bg-emerald-950">
          <JoinCodeBadge joinCode={joinCode} />
          <SpadesTable
            view={state.spadesView}
            viewingSeat={state.spadesSeat}
            onBlindNilChoice={(blindNil) => send({ type: "spades_blind_nil", blindNil })}
            onBid={(bid) => send({ type: "spades_bid", bid })}
            onPlayCard={(cardId) => send({ type: "spades_play", cardId })}
          />
          {state.spadesPausedUntil && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6">
              <div className="max-w-sm rounded-2xl bg-white p-6 text-center text-zinc-900 shadow-2xl">
                <h2 className="text-xl font-black">Game paused</h2>
                <p className="mt-2">A player has 60 seconds to reconnect. A computer player will take over afterward.</p>
              </div>
            </div>
          )}
          {state.spadesView.winner && (
            <div className="fixed inset-x-4 top-20 z-40 mx-auto max-w-md rounded-2xl bg-amber-300 p-4 text-center font-black text-zinc-950 shadow-xl">
              {state.spadesView.winner === "north-south" ? "North / South" : "East / West"} wins!
            </div>
          )}
          <ErrorToast message={state.error} onDismiss={clearError} />
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-zinc-500">Loading private Spades table…</p>
      </div>
    );
  }

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
        {devPanel()}
        <ErrorToast message={state.error} onDismiss={clearError} />
      </div>
    );
  }

  // Setup phase
  if (gameStatus === "setup") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <JoinCodeBadge joinCode={joinCode} />
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
        {devPanel({ canRevealTokens: true })}
        <ErrorToast message={state.error} onDismiss={clearError} />
      </div>
    );
  }

  // Active game
  if (gameStatus === "active") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <JoinCodeBadge joinCode={joinCode} />
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
        {devPanel({ canRevealTokens: true, canSkipTurn: true })}
        <ErrorToast message={state.error} onDismiss={clearError} />
      </div>
    );
  }

  // Game over
  if (gameStatus === "won" || gameStatus === "lost") {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <JoinCodeBadge joinCode={joinCode} />
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
          isCaptain={state.localPlayer?.id === state.game.captainId}
          currentMission={state.game.mission}
          onNextMission={(mission) => send({ type: "next_mission", mission })}
        />
        {devPanel()}
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
