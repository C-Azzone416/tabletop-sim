"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { GameRoomScene } from "../components/GameRoomScene";

export default function SignInPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      name: name.trim(),
      redirect: false,
    });

    if (result?.error) {
      setError("Could not sign in. Please try a different name.");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden font-sans">
      {/* Background scene */}
      <GameRoomScene />

      {/* Warm overlay — no black */}
      <div className="absolute inset-0 bg-amber-900/10" />

      {/* Sign-in card — compact, upper portion */}
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
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!name.trim() || loading}
                className="w-full rounded-lg bg-teal-700 px-4 py-3 font-medium text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Joining..." : "Enter the Room"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
