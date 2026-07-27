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
      <div className="absolute inset-0 bg-ink/10" />

      {/* Sign-in card — compact, upper portion */}
      <main className="relative z-10 mt-28 w-full max-w-sm px-6 sm:mt-36">
        <div className="rounded-cab border-2 border-outline bg-surface-raised/80 px-6 py-6 shadow-print-lg backdrop-blur-sm">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Tabletop Simulator
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Gather your friends. Roll the dice.
            </p>
          </div>

          {!expanded ? (
            <button
              onClick={() => setExpanded(true)}
              className="press mt-5 w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-3 font-bold text-accent-ink shadow-print-sm"
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
                  className="w-full rounded-cab border-2 border-outline bg-surface px-4 py-3 text-ink placeholder-ink-muted focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-cab border-2 border-outline bg-danger px-4 py-3 text-sm text-accent-ink">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!name.trim() || loading}
                className="press w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-3 font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
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
