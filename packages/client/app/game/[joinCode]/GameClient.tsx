"use client";

import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useGameState } from "../../hooks/useGameState";
import { useMissionOutcomes } from "../../hooks/useMissionOutcomes";
import { Lobby } from "../../components/Lobby";
import { SetupPhase } from "../../components/SetupPhase";
import { GameBoard } from "../../components/GameBoard";
import { FlipGameRoot } from "../../components/flip/FlipGameRoot";
import { GameOverOverlay } from "../../components/GameOverOverlay";
import { DevPanel } from "../../components/DevPanel";
import { ErrorToast } from "../../components/ErrorToast";
import { JoinCodeBadge } from "../../components/JoinCodeBadge";
import { LAST_MISSION } from "../../lib/missions";
import { highestUnlockedMission } from "../../lib/missionUnlocks";
import { readRoomGameType } from "../../lib/roomGameType";
import { apiHeaders } from "../../lib/serverApi";
import { actingPlayerId } from "../../components/flip/actingSeat";
import type { ClientMessage } from "@tabletop/shared";

/**
 * Flip's client->server actions (#383/#387). Cast rather than typed through
 * `ClientMessage` directly: #389 (server dispatch, deep-dingo) owns adding
 * these five variants to @tabletop/shared's ClientMessage union, including
 * `flip_start_round` which #389 doesn't have yet either — flagged on
 * control. Collapses to a plain `send` call once that merges.
 */
type FlipClientMessage =
  | { type: "flip_start_round" }
  | { type: "flip_hit" }
  | { type: "flip_freeze" }
  | { type: "flip_choose_freeze_target"; targetPlayerId: string }
  | { type: "flip_choose_flip3_target"; targetPlayerId: string };

export interface DevSeatOption {
  name: string;
  profileId: string;
}

interface GameClientProps {
  joinCode: string;
  profileId: string;
  playerName: string;
  seatOptions?: DevSeatOption[];
  /** #410: overrides the follow-acting-seat default (on for dev-seeded games) when set. */
  initialFollowActingSeat?: boolean;
}

export function GameClient({
  joinCode,
  profileId,
  playerName,
  seatOptions = [],
  initialFollowActingSeat,
}: GameClientProps) {
  const { state, handleMessage, clearError } = useGameState();
  const [activeSeat, setActiveSeat] = useState<DevSeatOption>({ profileId, name: playerName });
  const { status, connect, disconnect, send } = useWebSocket(
    handleMessage,
    activeSeat.profileId,
    activeSeat.name,
  );
  const sendFlipMessage = (message: FlipClientMessage) => send(message as unknown as ClientMessage);
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

  // Player id -> the seatOptions entry for that player, by name (the only
  // link between #370's seed-time seat list and a live player record — same
  // lookup the setup->active turn-holder follow below already used).
  const seatForPlayerId = (playerId: string | null): DevSeatOption | undefined => {
    if (!playerId) return undefined;
    const player = state.players.find((p) => p.id === playerId);
    return player ? seatOptions.find((s) => s.name === player.name) : undefined;
  };

  const gameStatus = state.game?.status;
  const currentTurnPlayerId = state.game?.currentTurnPlayerId;

  // #149 / #180: setup→active previously stranded the dev tester on
  // whatever seat they last placed a token as — active play starts on the
  // captain's turn, which is rarely the last placer. Auto-follow the turn
  // holder across that one transition so the tester isn't left viewing a
  // seat with no action buttons and no visible explanation why.
  //
  // Adjusts state during render (React's documented pattern for "adjusting
  // state when a prop/derived value changes",
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // instead of useEffect — react-hooks/set-state-in-effect flagged the old
  // effect-based version. Comparing gameStatus against a rendered-tracked
  // prevGameStatus gives the same one-shot-per-transition behavior as the
  // old effect (never re-fires on every currentTurnPlayerId change, so it
  // doesn't fight the player's own manual seat switches during normal
  // active play) without a post-commit effect round-trip.
  const [prevGameStatus, setPrevGameStatus] = useState(gameStatus);
  if (gameStatus !== prevGameStatus) {
    setPrevGameStatus(gameStatus);
    if (prevGameStatus === "setup" && gameStatus === "active" && seatOptions.length > 0 && currentTurnPlayerId) {
      const turnHolderSeat = seatForPlayerId(currentTurnPlayerId);
      if (turnHolderSeat) {
        handleSwitchSeat(turnHolderSeat);
      }
    }
  }

  // #410: Flip's dev view following whoever owes the next action — not just
  // the turn-holder (the flipper owed a Freeze/Flip 3 target choice often
  // isn't), and not just once at setup->active like the block above (every
  // turn hands the action to someone new, and a round boundary hands it to
  // the dealer). Default on for dev-seeded games; the explicit toggle in
  // DevPanel can turn it off, and "Go to acting seat" jumps once without it.
  //
  // Edge-triggered on (followActingSeat, actingId) rather than firing on
  // every render: a manual look-around mid-turn (acting id unchanged) is
  // left alone ("manual switching untouched" — #410's scope line), and the
  // view only snaps when the acted-for seat actually changes, or the toggle
  // is switched back on.
  const [followActingSeat, setFollowActingSeat] = useState(
    initialFollowActingSeat ?? seatOptions.length > 0,
  );
  const actingId = state.flip ? actingPlayerId(state.flip) : null;
  const followKey = `${followActingSeat}:${actingId ?? ""}`;
  const [prevFollowKey, setPrevFollowKey] = useState(followKey);
  if (followKey !== prevFollowKey) {
    setPrevFollowKey(followKey);
    if (followActingSeat && actingId) {
      const actingSeat = seatForPlayerId(actingId);
      if (actingSeat) handleSwitchSeat(actingSeat);
    }
  }

  const goToActingSeat = () => {
    const actingSeat = seatForPlayerId(actingId);
    if (actingSeat) handleSwitchSeat(actingSeat);
  };

  const devToolsEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

  // #179: gates both mission pickers (Lobby's start_game, GameOverOverlay's
  // next_mission) on the captain's own beat-to-unlock progress — the local
  // player is always the one viewing the picker, since it only renders for
  // isCaptain. Refetches on every gameStatus change so a just-recorded
  // win/loss isn't served stale. Dev tools show every mission unlocked
  // client-side, per the issue's explicit dev-bypass requirement.
  const missionOutcomes = useMissionOutcomes(activeSeat.profileId, activeSeat.name, gameStatus);
  const highestUnlocked = devToolsEnabled
    ? LAST_MISSION
    : highestUnlockedMission(missionOutcomes);

  // #172: Reveal All is a toggle. Toggle state is derived straight from the
  // broadcast rather than tracked locally — bobcat's #184 server piece
  // stamps every reveal-all-created (and seed-near-win-backfilled) token
  // `devCreated: true`, so any such token present in state.infoTokens IS
  // the "revealed" state, kept in sync automatically by every other client
  // too, not just the one that clicked the button.
  const devTokensRevealed = state.infoTokens.some((t) => t.devCreated);

  const revealAllTokens = () => {
    fetch(`${serverUrl}/dev/reveal-all-tokens`, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ joinCode }),
    });
  };

  const hideDevTokens = () => {
    fetch(`${serverUrl}/dev/hide-dev-tokens`, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ joinCode }),
    });
  };

  const skipTurn = () => {
    fetch(`${serverUrl}/dev/advance-turn`, {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ joinCode }),
    });
  };

  function devPanel(
    options: { canRevealTokens?: boolean; canSkipTurn?: boolean; showFollowActingSeat?: boolean } = {},
  ) {
    if (!devToolsEnabled) return null;
    return (
      <DevPanel
        seatOptions={seatOptions}
        activeProfileId={activeSeat.profileId}
        onSwitchSeat={handleSwitchSeat}
        onRevealAllTokens={options.canRevealTokens ? revealAllTokens : undefined}
        onHideDevTokens={options.canRevealTokens ? hideDevTokens : undefined}
        tokensRevealed={devTokensRevealed}
        onSkipTurn={options.canSkipTurn ? skipTurn : undefined}
        followActingSeat={options.showFollowActingSeat ? followActingSeat : undefined}
        onToggleFollowActingSeat={options.showFollowActingSeat ? setFollowActingSeat : undefined}
        onGoToActingSeat={options.showFollowActingSeat ? goToActingSeat : undefined}
        canGoToActingSeat={
          options.showFollowActingSeat ? !!actingId && actingId !== state.localPlayer?.id : undefined
        }
      />
    );
  }

  // Waiting / Lobby
  if (!state.game || gameStatus === "waiting") {
    return (
      <div className="min-h-screen bg-surface">
        <Lobby
          joinCode={joinCode}
          players={state.players}
          localPlayerId={state.localPlayer?.id ?? ""}
          captainId={state.game?.captainId ?? null}
          onReady={() => send({ type: "player_ready" })}
          onStartGame={(startArg) =>
            // #319: Wire Game's config slot returns its mission as a number,
            // which is the existing start_game shape — unchanged by the slot
            // refactor. `start_game` carries no per-game config field yet, so
            // any other shape sends no mission; carrying a second game's
            // config on the wire is #294's `start_game { gameType, config }`.
            send({
              type: "start_game",
              mission: typeof startArg === "number" ? startArg : undefined,
            })
          }
          highestUnlocked={highestUnlocked}
          gameType={readRoomGameType(state.game)}
        />
        {devPanel()}
        <ErrorToast message={state.error} onDismiss={clearError} />
      </div>
    );
  }

  // Setup phase
  if (gameStatus === "setup") {
    return (
      <div className="min-h-screen bg-surface">
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

  // Active Flip game (#383) — checked ahead of the Wire-only branch below,
  // which must stay completely unaffected (#383 AC: "the wire game is
  // completely unaffected — its rendering path must not regress").
  if (gameStatus === "active" && readRoomGameType(state.game) === "flip") {
    return (
      <div className="min-h-screen bg-surface">
        <JoinCodeBadge joinCode={joinCode} />
        {state.flip ? (
          <FlipGameRoot
            flip={state.flip}
            localPlayerId={state.localPlayer?.id ?? ""}
            onHit={() => sendFlipMessage({ type: "flip_hit" })}
            onFreeze={() => sendFlipMessage({ type: "flip_freeze" })}
            onChooseFreezeTarget={(targetId) =>
              sendFlipMessage({ type: "flip_choose_freeze_target", targetPlayerId: targetId })
            }
            onChooseFlip3Target={(targetId) =>
              sendFlipMessage({ type: "flip_choose_flip3_target", targetPlayerId: targetId })
            }
            onStartRound={() => sendFlipMessage({ type: "flip_start_round" })}
          />
        ) : (
          <p className="p-6 text-center text-sm text-ink-muted">Loading the table…</p>
        )}
        {devPanel({ showFollowActingSeat: true })}
        <ErrorToast message={state.error} onDismiss={clearError} />
      </div>
    );
  }

  // Active game
  if (gameStatus === "active") {
    return (
      <div className="min-h-screen bg-surface">
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
      <div className="min-h-screen bg-surface">
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
          highestUnlocked={highestUnlocked}
        />
        {devPanel()}
      </div>
    );
  }

  // Fallback: connecting
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <p className="text-ink-muted">
        {status === "connecting"
          ? "Connecting to server..."
          : "Loading game..."}
      </p>
    </div>
  );
}
