"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { GameRoomScene } from "./components/GameRoomScene";
import { ErrorToast } from "./components/ErrorToast";

export default function Home() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [name, setName] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signInLoading, setSignInLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const playerName = session?.user?.name ?? "";

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

  // #425 — the illustrated GameRoomScene shell is the home page in BOTH
  // auth states. It used to render only when signed out, so anyone with a
  // live session cookie (i.e. anyone who has used the app before) never
  // saw it — auth now only changes what sits in the card on top, not the
  // page underneath it.
  const signedIn = !!session?.user;

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden font-sans">
      <GameRoomScene />
      <div className="absolute inset-0 bg-ink/10" />

      <main className="relative z-10 mt-28 w-full max-w-sm px-6 sm:mt-36">
        <div className="rounded-cab border-2 border-outline bg-surface-raised/80 px-6 py-6 shadow-print-lg backdrop-blur-sm">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Tabletop Simulator
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Pick your meeple. Let&apos;s play!
            </p>
          </div>

          {signedIn ? (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-cab border-2 border-outline bg-surface px-4 py-3">
                <span className="text-sm text-ink-muted">
                  Playing as{" "}
                  <span className="font-medium text-ink">
                    {playerName}
                  </span>
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-sm text-ink-muted hover:text-ink"
                >
                  Change name
                </button>
              </div>

              <button
                onClick={() => router.push("/play")}
                className="press w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-3 font-bold text-accent-ink shadow-print-sm"
              >
                Play
              </button>
            </div>
          ) : !expanded ? (
            <button
              onClick={() => setExpanded(true)}
              className="press mt-5 w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-3 font-bold text-accent-ink shadow-print-sm"
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
                  className="w-full rounded-cab border-2 border-outline bg-surface px-4 py-3 text-ink placeholder-ink-muted focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!name.trim() || signInLoading}
                className="press w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-3 font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
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
