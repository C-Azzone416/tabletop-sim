"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ClientMessage } from "@tabletop/shared";
import { useWebSocket } from "../hooks/useWebSocket";
import { useGameState } from "../hooks/useGameState";
import { useActionTimeout, ACTION_TIMEOUT_MESSAGE } from "./useActionTimeout";

export type PlayActionMode = "idle" | "creating" | "joining";

/**
 * The WebSocket action lifecycle for every screen under /play.
 *
 * app/page.tsx owns this inline today: connect/send, a 10s timeout with
 * setActionError, `mode: "idle" | "creating" | "joining"`, and the
 * ErrorToast message. #315 moves it here so /play/host (#316) and
 * /play/join (#317) inherit one implementation instead of each growing
 * their own; #318 deletes the inline copy from the landing page.
 *
 * Behaviour is deliberately identical to the inline version:
 *  - `send` then `connect` (useWebSocket queues until the socket opens)
 *  - `game_created` / `joined_game` -> push /game/[joinCode]
 *  - server `error` -> back to idle, message surfaced via useGameState
 *  - no response within 10s -> back to idle with ACTION_TIMEOUT_MESSAGE
 */
export function usePlayAction() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [mode, setMode] = useState<PlayActionMode>("idle");
  const [actionError, setActionError] = useState("");

  const playerName = session?.user?.name ?? "";
  const profileId = session?.user?.id ?? "";

  const { state, handleMessage, clearError } = useGameState();

  const actionTimeout = useActionTimeout(() => {
    setMode("idle");
    setActionError(ACTION_TIMEOUT_MESSAGE);
  });

  const { status, connect, send } = useWebSocket(
    (message) => {
      handleMessage(message);
      if (message.type === "game_created" || message.type === "joined_game") {
        actionTimeout.clear();
        router.push(`/game/${message.game.joinCode}`);
      } else if (message.type === "error") {
        actionTimeout.clear();
        setMode("idle");
      }
    },
    profileId,
    playerName,
  );

  /**
   * Generic entry point: put the screen into `nextMode`, arm the timeout and
   * send `message`. Screens with their own message shape (#316's
   * `create_game { gameType }`) use this directly.
   */
  const startAction = (nextMode: Exclude<PlayActionMode, "idle">, message: ClientMessage) => {
    if (mode !== "idle" || !playerName) return false;
    setMode(nextMode);
    setActionError("");
    actionTimeout.start();
    send(message);
    connect();
    return true;
  };

  const createGame = () => startAction("creating", { type: "create_game", playerName });

  const joinGame = (joinCode: string) => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return false;
    return startAction("joining", { type: "join_game", joinCode: code, playerName });
  };

  const dismissError = () => {
    setActionError("");
    clearError();
  };

  return {
    session,
    sessionStatus,
    playerName,
    profileId,
    mode,
    isBusy: mode !== "idle",
    connectionStatus: status,
    /** Feed straight into <ErrorToast message={...} />. */
    errorMessage: actionError || state.error,
    dismissError,
    startAction,
    createGame,
    joinGame,
  };
}

export type PlaySessionGuardStatus = "loading" | "redirecting" | "ready";

/**
 * The session condition the inline create/join on app/page.tsx enforces
 * today, expressed once for the /play routes (#310 ruling: no NEW gating,
 * and none removed — page.tsx only ever offers create/join to a signed-in
 * user, and the sign-in form lives on `/`).
 *
 * Redirects in an effect rather than during render so React is not asked to
 * navigate mid-commit.
 */
export function usePlaySessionGuard(): PlaySessionGuardStatus {
  const router = useRouter();
  const { data: session, status } = useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    if (status !== "loading" && !signedIn) {
      router.replace("/");
    }
  }, [status, signedIn, router]);

  if (status === "loading") return "loading";
  return signedIn ? "ready" : "redirecting";
}
