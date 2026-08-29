import type { ComponentType } from "react";

/**
 * The lobby's per-game configuration slot (#319).
 *
 * `Lobby.tsx` renders whichever slot the room's `game_type` resolves to. It
 * never knows which game it is showing: it asks the registry for a slot, holds
 * that slot's config state, and renders whatever comes back. Adding a second
 * game's panel (Spades, #295) is a new slot file plus one registry entry —
 * `Lobby.tsx` itself does not change. That is the acceptance bar for this
 * story, so keep game-specific knowledge out of the lobby and inside the slot.
 */

/**
 * Platform-supplied context handed to every panel.
 *
 * `highestUnlocked` is Wire Game's per-profile mission progression (#179). It
 * lives here rather than inside the Wire slot because only the lobby's caller
 * (`GameClient`) can fetch it, and the lobby must stay game-agnostic. Games
 * with no progression ignore it. When a second game needs progression data of
 * its own this becomes a per-game bag rather than growing more Wire-shaped
 * fields.
 */
export interface LobbyConfigContext {
  highestUnlocked: number;
}

export interface LobbyConfigPanelProps<C> {
  config: C;
  onChange: (next: C) => void;
  /**
   * False renders the panel read-only. Today the lobby mounts the panel for
   * the captain only, exactly as it did before this refactor, so this is
   * always true in practice — see the note in `Lobby.tsx`. The flag exists
   * (and is implemented and tested per panel) so that showing every player a
   * read-only view becomes a one-line change in `Lobby.tsx` once the selected
   * config is actually replicated in room state.
   */
  canEdit: boolean;
  context: LobbyConfigContext;
}

/**
 * What the lobby hands back to `onStartGame`.
 *
 * `number` is Wire Game's existing `start_game { mission }` shape, preserved
 * byte-for-byte by this refactor. New games return an object of message
 * fields. Both collapse into a single `config` object once #294's
 * `start_game { gameType, config }` dispatch lands.
 */
export type LobbyStartArg = number | Record<string, unknown>;

export interface LobbyConfigSlot<C> {
  /** Registry id, matching the room's `game_type`. */
  gameId: string;
  /** Heading rendered above the panel. */
  title: string;
  createDefaultConfig: (context: LobbyConfigContext) => C;
  Panel: ComponentType<LobbyConfigPanelProps<C>>;
  /** Label for the lobby's start button, e.g. "Start Mission 3". */
  startLabel: (config: C) => string;
  /** Maps this game's config onto the argument `onStartGame` expects. */
  toStartArg: (config: C) => LobbyStartArg;
}

/**
 * A slot with its config type erased, so slots for different games can share
 * one registry. The lobby only stores and forwards the config value, never
 * inspects it, so `unknown` costs it nothing.
 */
export type AnyLobbyConfigSlot = LobbyConfigSlot<unknown>;

/**
 * Declares a slot with its own config type fully checked, then erases that
 * type for the registry. The single cast lives here rather than at each call
 * site.
 */
export function defineLobbyConfigSlot<C>(slot: LobbyConfigSlot<C>): AnyLobbyConfigSlot {
  return slot as AnyLobbyConfigSlot;
}
