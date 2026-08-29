"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { GameRegistryEntry } from "@tabletop/shared";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useGameState } from "../../hooks/useGameState";
import { GameSelectionGrid } from "../../components/GameSelectionGrid";
import { ErrorToast } from "../../components/ErrorToast";
import { useActionTimeout } from "./useActionTimeout";

export default function HostSelection() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [mode, setMode] = useState<"idle" | "creating">("idle");
  const [actionError, setActionError] = useState("");

  const playerName = session?.user?.name ?? "";
  const profileId = session?.user?.id ?? "";

  const { state, handleMessage, clearError } = useGameState();
  const actionTimeout = useActionTimeout(() => {
    setMode("idle");
    setActionError("Server did not respond. Please try again.");
  });
  const { connect, send } = useWebSocket(
    (message) => {
      handleMessage(message);
      if (message.type === "game_created") {
        router.push(`/game/${message.game.joinCode}`);
      } else if (message.type === "error") {
        setMode("idle");
        actionTimeout.clear();
      }
    },
    profileId,
    playerName,
  );

  const handleSelect = (game: GameRegistryEntry) => {
    if (mode !== "idle" || !playerName) return;
    setMode("creating");
    setActionError("");
    actionTimeout.start();
    send({ type: "create_game", playerName, gameType: game.id });
    connect();
  };

  if (sessionStatus === "loading") {
    return null;
  }

  if (!session?.user) {
    router.replace("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-surface px-6 py-10 font-sans">
      <main className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Choose a game
          </h1>
          <p className="mt-2 text-ink-muted">
            {mode === "creating" ? "Creating room..." : "Pick what to host"}
          </p>
        </div>

        <GameSelectionGrid onSelect={handleSelect} disabled={mode !== "idle"} />
      </main>
      <ErrorToast
        message={actionError || state.error}
        onDismiss={() => {
          setActionError("");
          clearError();
        }}
      />
    </div>
  );
}
