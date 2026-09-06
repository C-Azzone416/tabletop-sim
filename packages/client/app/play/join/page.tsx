"use client";

import { useState } from "react";
import { ErrorToast } from "../../components/ErrorToast";
import { isValidJoinCodeFormat } from "../../lib/joinCode";
import { PlayScreen } from "../PlayScreen";
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
 *
 * #335/#355: adopted the shared PlayScreen chrome. PlayScreen is
 * max-w-3xl; the join code input keeps its own inner max-w-sm rather than
 * widening the whole page — the narrow field is a property of that
 * control, not the screen.
 */
export default function JoinByCode() {
  const guard = usePlaySessionGuard();
  const { mode, isBusy, playerName, connectionStatus, errorMessage, dismissError, joinGame } =
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
    <>
      <PlayScreen backHref="/play" title="Join a game" subtitle="Enter the code your host gave you">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
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

          {connectionStatus === "connecting" && (
            <p className="text-center text-sm text-ink-muted">
              Connecting to server...
            </p>
          )}
        </div>
      </PlayScreen>
      <ErrorToast
        message={formatError || errorMessage}
        onDismiss={() => {
          setFormatError("");
          dismissError();
        }}
      />
    </>
  );
}
