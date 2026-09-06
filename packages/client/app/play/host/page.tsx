"use client";

import type { GameRegistryEntry } from "@tabletop/shared";
import { GameSelectionGrid } from "../../components/GameSelectionGrid";
import { ErrorToast } from "../../components/ErrorToast";
import { PlayScreen } from "../PlayScreen";
import { usePlayAction, usePlaySessionGuard } from "../usePlayAction";

/**
 * #316's game-selection screen (PR #323), re-pointed at the shared /play
 * action lifecycle in #315 as that PR's description anticipated. The local
 * app/play/host/useActionTimeout.ts and the inline mode/error/WebSocket
 * wiring are gone; usePlayAction carries the same behaviour for every
 * /play screen. Markup is unchanged.
 *
 * #318's cutover-deletion audit found today's app/page.tsx also renders a
 * "Connecting to server..." indicator off the raw WebSocket status, which
 * usePlayAction exposes as connectionStatus but this screen wasn't yet
 * reading. Relocated (not dropped): the 10s timeout/error toast covers the
 * hang case, but the brief pre-connect window before that timeout is a real
 * gap this indicator closes, same as it did on the page it's replacing.
 *
 * #335/#355: adopted the shared PlayScreen chrome (back affordance, heading,
 * column) instead of hand-rolling it, per the #310 ruling this had drifted
 * from. GameSelectionGrid is untouched — left-aligning the heading via
 * PlayScreen closes #355's centring mismatch without touching the grid.
 */
export default function HostSelection() {
  const guard = usePlaySessionGuard();
  const { mode, isBusy, connectionStatus, errorMessage, dismissError, createGame } = usePlayAction();

  // The registry entry the player picked carries the gameType; nothing
  // defaults it (see createGame's note and #313).
  const handleSelect = (game: GameRegistryEntry) => {
    createGame(game.id);
  };

  if (guard !== "ready") {
    return null;
  }

  return (
    <>
      <PlayScreen
        backHref="/play"
        title="Choose a game"
        subtitle={mode === "creating" ? "Creating room..." : "Pick what to host"}
      >
        <GameSelectionGrid onSelect={handleSelect} disabled={isBusy} />

        {connectionStatus === "connecting" && (
          <p className="mt-4 text-center text-sm text-ink-muted">
            Connecting to server...
          </p>
        )}
      </PlayScreen>
      <ErrorToast message={errorMessage} onDismiss={dismissError} />
    </>
  );
}
