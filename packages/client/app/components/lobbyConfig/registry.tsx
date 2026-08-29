"use client";

import { defineLobbyConfigSlot, type AnyLobbyConfigSlot } from "./types";
import { wireGameConfigSlot } from "./wireGameSlot";

/**
 * Which config panel the lobby shows for which game (#319).
 *
 * ADDING A GAME: write a slot module next to `wireGameSlot.tsx` and add it to
 * `LOBBY_CONFIG_SLOTS` below. `Lobby.tsx` does not change — that is the
 * acceptance criterion for this story. Spades (#295) fills this same slot.
 */
const LOBBY_CONFIG_SLOTS: readonly AnyLobbyConfigSlot[] = [wireGameConfigSlot];

/**
 * Rendered when the room reports a game type that has no panel registered yet
 * — e.g. a Spades room created before #295 lands. Deliberately NOT the Wire
 * Game panel: showing Wire Game's missions for a non-Wire room would be wrong
 * information rather than a graceful degradation.
 */
const unconfiguredGameSlot = defineLobbyConfigSlot<Record<string, never>>({
  gameId: "__unconfigured__",
  title: "Game Options",
  createDefaultConfig: () => ({}),
  Panel: function UnconfiguredGamePanel() {
    return (
      <p className="text-sm text-ink-muted">
        This game has no options to configure yet.
      </p>
    );
  },
  startLabel: () => "Start Game",
  toStartArg: () => ({}),
});

/**
 * Resolves the room's `game_type` to a config slot.
 *
 * `gameType` is null on `develop` today: it reaches room state only once #313
 * / PR #325 lands (`Game.gameType`, carried in `game_created` and every
 * broadcast embedding `Game`). Until then this degrades to the Wire Game
 * panel, which is correct because Wire Game is the only game a room can
 * currently be.
 *
 * That fallback is deliberately narrow, and applies ONLY to a null/absent
 * value. A non-null id that is not registered resolves to the neutral
 * unconfigured slot instead of silently becoming Wire Game — otherwise a
 * future Spades room would quietly render a mission picker, and the missing
 * panel would be masked rather than visible.
 */
export function resolveLobbyConfigSlot(gameType: string | null): AnyLobbyConfigSlot {
  if (gameType === null) {
    if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
      console.warn(
        "[lobby] room state carries no gameType; falling back to the Wire Game " +
          "config panel. This fallback is removable once #313/#325 lands.",
      );
    }
    return wireGameConfigSlot;
  }

  return (
    LOBBY_CONFIG_SLOTS.find((slot) => slot.gameId === gameType) ?? unconfiguredGameSlot
  );
}
