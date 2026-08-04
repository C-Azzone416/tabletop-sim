"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useGameState } from "./hooks/useGameState";
import { GameRoomScene } from "./components/GameRoomScene";
import { ErrorToast } from "./components/ErrorToast";
import { GameSelector } from "./components/GameSelector";
import type { GameType } from "@tabletop/shared";

export default function Home() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [joinCode, setJoinCode] = useState("");
  const [selectedGame, setSelectedGame] = useState<GameType>("spades");
  const [mode, setMode] = useState<"idle" | "creating" | "joining">("idle");
  const [name, setName] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signInLoading, setSignInLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [actionError, setActionError] = useState("");
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerName = session?.user?.name ?? "";
  const profileId = session?.user?.id ?? "";

  const { state, handleMessage, clearError } = useGameState();
  const { status, connect, send } = useWebSocket(
    (message) => {
      handleMessage(message);
      if (message.type === "game_created") {
        router.push(`/game/${message.game.joinCode}`);
      } else if (message.type === "joined_game") {
        router.push(`/game/${message.game.joinCode}`);
      } else if (message.type === "error") {
        setMode("idle");
      }
    },
    profileId,
    playerName,
  );

  const startActionTimeout = () => {
    if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    actionTimeoutRef.current = setTimeout(() => {
      setMode("idle");
      setActionError("Server did not respond. Please try again.");
    }, 10_000);
  };

  useEffect(() => {
    if (mode === "idle" && actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }
  }, [mode]);

  const handleCreate = () => {
    if (!playerName) return;
    setMode("creating");
    setActionError("");
    startActionTimeout();
    send({ type: "create_game", playerName, gameType: selectedGame });
    connect();
  };

  const handleJoin = () => {
    if (!playerName || !joinCode.trim()) return;
    setMode("joining");
    setActionError("");
    startActionTimeout();
    send({
      type: "join_game",
      joinCode: joinCode.trim().toUpperCase(),
      playerName,
    });
    connect();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSignInLoading(true);
    setSignInError("");

    const result = await signIn("credentials", {
      name: name.trim(),
      redirect: false,
    });

    if (result?.error) {
      setSignInError("Could not sign in. Please try a different name.");
      setSignInLoading(false);
    } else {
      router.refresh();
    }
  };

  // Loading state
  if (sessionStatus === "loading") {
    return null;
  }

  // Unauthenticated — show illustrated landing page with sign-in
  if (!session?.user) {
    return (
      <div className="relative flex min-h-screen flex-col items-center overflow-hidden font-sans">
        <GameRoomScene />
        <div className="absolute inset-0 bg-amber-900/10" />

        <main className="relative z-10 mt-28 w-full max-w-sm px-6 sm:mt-36">
          <div className="rounded-2xl border border-stone-300/50 bg-stone-50/80 px-6 py-6 shadow-2xl backdrop-blur-sm dark:bg-stone-900/70">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Tabletop Simulator
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Gather your friends. Roll the dice.
              </p>
            </div>

            {!expanded ? (
              <button
                onClick={() => setExpanded(true)}
                className="mt-5 w-full rounded-lg bg-teal-700 px-4 py-3 font-medium text-white transition-colors hover:bg-teal-800"
              >
                Join
              </button>
            ) : (
              <form onSubmit={handleSignIn} className="mt-5 space-y-4">
                <div>
                  <input
                    id="player-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Choose your name"
                    maxLength={20}
                    autoFocus
                    className="w-full rounded-lg border border-stone-300 bg-white/60 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 dark:border-stone-600 dark:bg-stone-800/40 dark:text-stone-100 dark:placeholder-stone-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!name.trim() || signInLoading}
                  className="w-full rounded-lg bg-teal-700 px-4 py-3 font-medium text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {signInLoading ? "Joining..." : "Enter the Room"}
                </button>
              </form>
            )}
          </div>
        </main>
        <ErrorToast message={signInError || null} onDismiss={() => setSignInError("")} />
      </div>
    );
  }

  // Authenticated — show game lobby
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="w-full max-w-md px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Tabletop Simulator
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Cut the right wires. Save the day.
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Playing as{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {playerName}
            </span>
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Change name
          </button>
        </div>

        <div className="space-y-6">
          <GameSelector
            selected={selectedGame}
            onSelect={setSelectedGame}
            disabled={mode !== "idle"}
          />

          <button
            onClick={handleCreate}
            disabled={mode !== "idle"}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === "creating" ? "Creating..." : "Create New Game"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-300 dark:border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-zinc-50 px-4 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                or join an existing game
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              maxLength={6}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 font-mono text-center uppercase tracking-widest text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
            <button
              onClick={handleJoin}
              disabled={!joinCode.trim() || mode !== "idle"}
              className="rounded-lg bg-zinc-800 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
            >
              {mode === "joining" ? "Joining..." : "Join"}
            </button>
          </div>

          {status === "connecting" && (
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Connecting to server...
            </p>
          )}
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
