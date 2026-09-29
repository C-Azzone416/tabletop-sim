"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GameRegistryEntry } from "@tabletop/shared";
import { GameSelectionGrid } from "../../components/GameSelectionGrid";
import { PlayerCountPicker } from "../../components/PlayerCountPicker";
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
 *
 * #437: picking a game no longer creates the room immediately. It moves to a
 * second step on this same screen — no new route, per Caroline's ruling —
 * where the host picks a count (or sees a fixed one stated) before
 * confirming. "Back" from the count step returns to the grid rather than
 * leaving /play/host, so a host who picked the wrong game isn't dumped out.
 */
export default function HostSelection() {
  const router = useRouter();
  const guard = usePlaySessionGuard();
  const { mode, isBusy, connectionStatus, errorMessage, dismissError, createGame } = usePlayAction();
  const [selectedGame, setSelectedGame] = useState<GameRegistryEntry | null>(null);
  const [count, setCount] = useState<number | null>(null);

  // The registry entry the player picked carries min/maxPlayers; nothing
  // defaults them (see createGame's note and #313).
  const handleSelect = (game: GameRegistryEntry) => {
    if (game.launchMode === "local" && game.launchPath) {
      router.push(game.launchPath);
      return;
    }
    setSelectedGame(game);
    setCount(game.minPlayers === game.maxPlayers ? game.maxPlayers : null);
  };

  const handleBack = () => {
    setSelectedGame(null);
    setCount(null);
  };

  const handleConfirm = () => {
    if (!selectedGame || count === null) return;
    createGame(selectedGame.id, count);
  };

  if (guard !== "ready") {
    return null;
  }

  return (
    <>
      <PlayScreen
        backHref="/play"
        title="Choose a game"
        subtitle={mode === "creating" ? "Creating room..." : "Choose online or hot-seat play"}
      >
        {selectedGame ? (
          <div className="flex flex-col items-start gap-6">
            <button
              type="button"
              onClick={handleBack}
              disabled={isBusy}
              className="press min-h-11 text-body text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Choose a different game
            </button>

            <div>
              <h2 className="font-bold text-ink">{selectedGame.displayName}</h2>
              <p className="mt-1 text-sm text-ink-muted">{selectedGame.description}</p>
            </div>

            <div className="w-full">
              <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
                Players
              </h3>
              <PlayerCountPicker
                game={selectedGame}
                value={count ?? selectedGame.minPlayers}
                onChange={setCount}
                disabled={isBusy}
              />
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isBusy || count === null}
              className="press min-h-11 rounded-cab border-2 border-outline bg-accent px-8 py-3 font-bold text-accent-ink shadow-print-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === "creating" ? "Creating..." : "Create Room"}
            </button>
          </div>
        ) : (
          <GameSelectionGrid onSelect={handleSelect} disabled={isBusy} />
        )}

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
