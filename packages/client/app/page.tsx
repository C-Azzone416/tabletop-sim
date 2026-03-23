"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "./hooks/useWebSocket";
import { useGameState } from "./hooks/useGameState";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"idle" | "creating" | "joining">("idle");

  const { state, handleMessage } = useGameState();
  const { status, connect, send } = useWebSocket((message) => {
    handleMessage(message);
    if (message.type === "game_created") {
      router.push(`/game/${message.game.joinCode}`);
    } else if (message.type === "joined_game") {
      router.push(`/game/${message.game.joinCode}`);
    } else if (message.type === "error") {
      setMode("idle");
    }
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    setMode("creating");
    connect();
    // Wait for connection, then send
    const interval = setInterval(() => {
      send({ type: "create_game", playerName: name.trim() });
      clearInterval(interval);
    }, 500);
  };

  const handleJoin = () => {
    if (!name.trim() || !joinCode.trim()) return;
    setMode("joining");
    connect();
    const interval = setInterval(() => {
      send({
        type: "join_game",
        joinCode: joinCode.trim().toUpperCase(),
        playerName: name.trim(),
      });
      clearInterval(interval);
    }, 500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="w-full max-w-md px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Bomb Busters
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Cut the right wires. Save the day.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label
              htmlFor="player-name"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Your Name
            </label>
            <input
              id="player-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          {state.error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {state.error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!name.trim() || mode !== "idle"}
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
              disabled={!name.trim() || !joinCode.trim() || mode !== "idle"}
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
    </div>
  );
}
