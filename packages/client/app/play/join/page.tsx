"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useGameState } from "../../hooks/useGameState";
import { ErrorToast } from "../../components/ErrorToast";
import { isValidJoinCodeFormat } from "../../lib/joinCode";
import { useActionTimeout } from "./useActionTimeout";

export default function JoinByCode() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"idle" | "joining">("idle");
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
      if (message.type === "joined_game") {
        router.push(`/game/${message.game.joinCode}`);
      } else if (message.type === "error") {
        setMode("idle");
        actionTimeout.clear();
      }
    },
    profileId,
    playerName,
  );

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (mode !== "idle" || !playerName || !code) return;

    if (!isValidJoinCodeFormat(code)) {
      setActionError("That code doesn't look right. Check it and try again.");
      return;
    }

    setMode("joining");
    setActionError("");
    actionTimeout.start();
    send({ type: "join_game", joinCode: code, playerName });
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
      <main className="mx-auto max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Join a game
          </h1>
          <p className="mt-2 text-ink-muted">
            Enter the code your host gave you
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Enter code"
            maxLength={6}
            autoFocus
            className="w-full rounded-cab border-2 border-outline bg-surface-raised px-4 py-3 font-mono text-center text-lg uppercase tracking-widest text-ink placeholder-ink-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={!joinCode.trim() || mode !== "idle"}
            className="press w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-3 font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
          >
            {mode === "joining" ? "Joining..." : "Join"}
          </button>
        </div>
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
