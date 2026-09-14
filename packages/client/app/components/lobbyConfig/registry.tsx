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
 * Resolves the room's `game_type` to a config slot, or `null` when the room
 * has not loaded yet.
 *
 * #313/#314/#312 made `gameType` required on `Game`, `games.game_type`
 * NOT NULL with a CHECK, and `create_game` reject a missing value
 * server-side. `null` can therefore no longer mean "this room has no game
 * type" — every room that exists has one. It can only mean "room state has
 * not loaded yet" (`GameClient` renders the lobby under
 * `if (!state.game || ...)`, so this genuinely happens on every lobby
 * mount, however briefly, before the first server message arrives).
 *
 * #333 — this used to degrade a null gameType to the Wire Game panel, back
 * when Wire Game really was the only game a room could be. That fallback
 * silently picked a specific game, which is exactly what the unregistered-id
 * path below is deliberately NOT doing, for good reason: a dead fallback
 * that picks a game stops being harmless the moment this helper is reused
 * somewhere its author did not anticipate. Returning `null` instead makes
 * "not loaded yet" its own explicit state — the caller renders nothing
 * rather than guessing.
 *
 * A non-null id that is not registered resolves to the neutral unconfigured
 * slot, never Wire Game — otherwise a future Spades room would quietly
 * render a mission picker, and the missing panel would be masked rather
 * than visible.
 */
export function resolveLobbyConfigSlot(gameType: string | null): AnyLobbyConfigSlot | null {
  if (gameType === null) return null;

  return (
    LOBBY_CONFIG_SLOTS.find((slot) => slot.gameId === gameType) ?? unconfiguredGameSlot
  );
}
