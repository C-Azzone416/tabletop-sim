"use client";

import { useState } from "react";
import { ErrorToast } from "../../components/ErrorToast";
import { isValidJoinCodeFormat } from "../../lib/joinCode";
import { usePlayAction, usePlaySessionGuard } from "../usePlayAction";

/**
 * #317's join-by-code screen (PR #327), re-pointed at the shared /play
 * action lifecycle in #315 as that PR anticipated. The local
 * app/play/join/useActionTimeout.ts and the inline mode/error/WebSocket
 * wiring are gone; usePlayAction carries the same behaviour for every
 * /play screen. Markup is unchanged.
 *
 * The client-side format check stays local: it is a pre-flight that must
 * NOT send or connect, so it never enters the action lifecycle at all. Its
 * message shares the one ErrorToast, ahead of the lifecycle's message, as
 * it did before.
 */
export default function JoinByCode() {
  const guard = usePlaySessionGuard();
  const { mode, isBusy, playerName, errorMessage, dismissError, joinGame } =
    usePlayAction();
  const [joinCode, setJoinCode] = useState("");
  const [formatError, setFormatError] = useState("");

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (isBusy || !playerName || !code) return;

    if (!isValidJoinCodeFormat(code)) {
      setFormatError("That code doesn't look right. Check it and try again.");
      return;
    }

    setFormatError("");
    joinGame(code);
  };

  if (guard !== "ready") {
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
            disabled={!joinCode.trim() || isBusy}
            className="press w-full min-h-11 rounded-cab border-2 border-outline bg-accent px-4 py-3 font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
          >
            {mode === "joining" ? "Joining..." : "Join"}
          </button>
        </div>
      </main>
      <ErrorToast
        message={formatError || errorMessage}
        onDismiss={() => {
          setFormatError("");
          dismissError();
        }}
      />
    </div>
  );
}
