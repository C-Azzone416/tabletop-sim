"use client";

import { useEffect, useState } from "react";
import { getGameById } from "@tabletop/shared";
import type { Player, LobbyConfigValue } from "@tabletop/shared";
import { resolveLobbyConfigSlot } from "./lobbyConfig/registry";
import type { LobbyStartArg } from "./lobbyConfig/types";
import { BackAffordance } from "./BackAffordance";
import { PlayerCountPicker } from "./PlayerCountPicker";

interface LobbyProps {
  joinCode: string;
  players: Player[];
  localPlayerId: string;
  captainId: string | null;
  onReady: () => void;
  onStartGame: (startArg: LobbyStartArg) => void;
  /**
   * #451/#430 — leaving the lobby frees a seat, so this sends `leave_game`
   * (not a plain route change) before GameClient navigates away. The only
   * pre-game view #430's audit found with no exit at all.
   */
  onLeave: () => void;
  /**
   * #438 — the host resizing the room's player count from the lobby, before
   * everyone is ready. Server-enforced (host-only, lobby-only, registry
   * bounds, refuses below current occupancy) — this is the friendly UI on
   * top of that, not the actual gate.
   */
  onChangePlayerCount: (count: number) => void;
  // #179: {1..highestUnlocked} are pickable for the captain.
  highestUnlocked: number;
  /**
   * The room's `game_type`, which picks the config panel (#319). `gameType`
   * is required on a loaded room (#313/#314/#312) — this is `null` only
   * during the brief window before room state has loaded at all (see
   * `resolveLobbyConfigSlot`, which returns `null` for exactly that case).
   */
  gameType?: string | null;
  /**
   * #437 — the host's chosen room capacity (`Game.maxPlayers`), NOT the
   * game's registry ceiling. #407 read the ceiling via `gameType` because
   * nothing else existed yet; that was always a stand-in for the host's
   * actual choice, which #437 now persists on the room itself. Null for the
   * same reason `gameType` is: `state.game` hasn't arrived on the very
   * first render.
   */
  maxPlayers?: number | null;
  /**
   * #329 — the captain's current config pick, replicated from room state.
   * Null means "not received yet", not "no config" — see `useGameState`'s
   * own doc comment on this field. Read by non-captains only; the captain
   * uses its own local edit state (`config` below) so typing/clicking never
   * has to wait on a round trip to render.
   */
  lobbyConfig?: LobbyConfigValue | null;
  /**
   * #329 — the captain committing a new config value for replication.
   * Never called by a non-captain (there is nothing for them to commit).
   */
  onConfigChange: (config: LobbyConfigValue) => void;
}

export function Lobby({
  joinCode,
  players,
  localPlayerId,
  captainId,
  onReady,
  onStartGame,
  onLeave,
  onChangePlayerCount,
  highestUnlocked,
  gameType = null,
  maxPlayers: roomMaxPlayers = null,
  lobbyConfig = null,
  onConfigChange,
}: LobbyProps) {
  const isCaptain = localPlayerId === captainId;
  const localPlayer = players.find((p) => p.id === localPlayerId);
  const isLocalPlayerReady = localPlayer?.ready ?? false;
  const allPlayersReady = players.every((p) => p.ready);
  const notReadyPlayerNames = players.filter((p) => !p.ready).map((p) => p.name);
  // #437 — falls back to Wire Game's historical default only for the brief
  // window before state.game arrives (same window gameType's null covers);
  // once it has, this is always the room's own persisted count, never a
  // registry lookup.
  const maxPlayers = roomMaxPlayers ?? 4;
  const canStart = players.length >= 1 && players.length <= maxPlayers && allPlayersReady;
  const [isStarting, setIsStarting] = useState(false);

  // #438 — a Wire Game default for the same brief pre-load window
  // `resolveLobbyConfigSlot` covers below, kept ONLY for the player-count
  // picker's bounds (not out of scope for #333 — #333 is specifically about
  // the config-panel fallback, which silently picked a specific game's
  // interactive controls; this only sizes a bound during a window so brief
  // it's never actually visible). A fixed-size game (Spades) has
  // minPlayers === maxPlayers, which PlayerCountPicker already renders as a
  // statement rather than a control — no separate "offers no control"
  // branch needed here.
  const registryEntry = getGameById(gameType ?? "wire-game");
  const playerCountLocked = allPlayersReady;

  // #319: the lobby holds the config value but never interprets it — the slot
  // for the room's game type owns its shape, its panel, its start label and
  // how it maps onto onStartGame. Adding a game must not touch this file.
  //
  // #333 — `slot` is `null` while the room has not loaded yet
  // (`resolveLobbyConfigSlot` no longer guesses a game for that window; see
  // its own doc comment). `configGameId` starts at `null` too, distinct from
  // every real slot's `gameId` (including the neutral fallback's
  // "__unconfigured__"), so the render-phase reset below still fires
  // correctly the first time a real slot resolves.
  const configContext = { highestUnlocked };
  const slot = resolveLobbyConfigSlot(gameType);
  const [config, setConfig] = useState<unknown>(() =>
    slot?.createDefaultConfig(configContext),
  );
  const [configGameId, setConfigGameId] = useState<string | null>(slot?.gameId ?? null);

  // Reset the config when the slot changes rather than keeping one game's
  // value under another game's panel. Fires both when gameType arrives after
  // the first render (room state had not loaded yet) and when it changes
  // from one registered game to another mid-session.
  //
  // #333 — `setConfig` here schedules the update for the NEXT render;
  // `config` (the hook's own binding) still holds the OLD value for the
  // REST OF THIS render, while `slot` above is already the NEW slot
  // (recomputed fresh every render, not stateful). Every other read of
  // `config` in this render must go through `effectiveConfig`, or it passes
  // the new slot's `startLabel`/`toStartArg` a config shaped for the slot
  // being replaced — this crashes today's newly-added transition test
  // otherwise (`config.mission` on a config that's `undefined` mid-load, or
  // a leftover Wire Game config reaching a different game's `toStartArg`).
  const effectiveConfig =
    slot && configGameId !== slot.gameId ? slot.createDefaultConfig(configContext) : config;
  if (slot && configGameId !== slot.gameId) {
    setConfigGameId(slot.gameId);
    setConfig(effectiveConfig);
  }

  // #329 — replicates the captain's edit into room state so every other
  // player sees it live. Broadcasts on every committed change (see
  // ClientMessage's `update_lobby_config` doc comment for why "every
  // commit" is the right granularity — every panel's onChange today fires
  // on a discrete, complete selection, not a keystroke). Sends
  // `effectiveConfig`, not `slot.toStartArg(effectiveConfig)`: this is the
  // slot's own internal shape, so a non-captain's client can feed the
  // received value straight back into the same ConfigPanel with no second
  // mapping — see LobbyConfigValue's own doc comment.
  //
  // Non-captains never reach this effect (guarded on isCaptain first) —
  // there is nothing for them to commit, only to read.
  useEffect(() => {
    if (!isCaptain || !slot) return;
    onConfigChange(effectiveConfig as LobbyConfigValue);
    // `onConfigChange` deliberately excluded: it's `GameClient.tsx`'s
    // `(config) => send(...)`, a fresh function reference every render even
    // though `send` itself is stable. Depending on it would re-broadcast
    // the SAME config on every unrelated GameClient re-render (a
    // reconnecting-indicator tick, another player's ready toggle), not
    // just on a real change — `effectiveConfig` is a fresh object
    // reference only when `config` actually changes (useState preserves
    // the same reference otherwise) or the slot transitions, which is
    // exactly the "committed change" granularity this is meant to fire on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveConfig, isCaptain, slot]);

  // #329 — the panel's displayed value: the captain's own local edit state
  // while editing (never waits on the round trip to see their own
  // keystroke/click), the replicated room-state value for everyone else.
  // Rendering the section at all is gated below on this being non-null for
  // a non-captain — showing nothing until the real value arrives, never a
  // guessed default, is the whole point of #329 (a read-only panel that
  // can't yet be sure of the captain's pick is the exact "wrong
  // information to everyone but one person" problem it exists to fix).
  const displayConfig = isCaptain ? effectiveConfig : lobbyConfig;

  const ConfigPanel = slot?.Panel;

  const handleStartGame = () => {
    if (isStarting || !slot) return;
    setIsStarting(true);
    onStartGame(slot.toStartArg(effectiveConfig));
  };

  return (
    <div className="flex flex-col items-center gap-8 p-8">
      <div className="w-full max-w-sm self-start">
        <BackAffordance label="← Leave" onClick={onLeave} />
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold text-ink">
          Game Lobby
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="text-sm text-ink-muted">
            Join Code:
          </span>
          <code className="rounded-cab bg-surface-raised px-3 py-1 text-lg font-mono font-bold tracking-widest text-ink">
            {joinCode}
          </code>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Share this code with other players
        </p>
      </div>

      <div className="w-full max-w-sm">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
          Players ({players.length}/{maxPlayers})
        </h3>
        <ul className="space-y-2">
          {players.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-3 rounded-cab border-2 border-outline bg-surface-raised px-4 py-3"
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  player.ready ? "bg-success" : "bg-line-soft"
                }`}
                title={player.ready ? "Ready" : "Not ready"}
              />
              <span className="font-medium text-ink">
                {player.name}
              </span>
              {player.id === captainId && (
                <span className="ml-auto rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-ink">
                  Captain
                </span>
              )}
              {player.id === localPlayerId && (
                <span className={player.id === captainId ? "text-xs text-ink-muted" : "ml-auto text-xs text-ink-muted"}>
                  (you)
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/*
        #438 — host-only, and only while the room can still take the change:
        registry bounds mean a fixed-size game (Spades) offers no control at
        all — the issue's own words — so the whole section is absent, not
        just the picker's buttons; PlayerCountPicker's statement branch
        exists for other callers (e.g. #437's host-selection screen) but
        would be a pointless "4 players" label with nothing to do here. The
        count also locks once everyone seated is ready — readiness needs an
        actual consequence. Server-enforced independently of this UI
        (host-only, lobby-only, bounds, refuses-below-occupancy all live in
        engine.updatePlayerCount); this is the friendly version, not the gate.
      */}
      {isCaptain && registryEntry && registryEntry.minPlayers !== registryEntry.maxPlayers && (
        <div className="w-full max-w-sm">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
            Player Count
          </h3>
          <PlayerCountPicker
            game={registryEntry}
            value={maxPlayers}
            onChange={onChangePlayerCount}
            disabled={playerCountLocked}
            minSelectable={players.length}
          />
          {playerCountLocked ? (
            <p className="mt-2 text-xs text-ink-muted">
              Locked — everyone is ready.
            </p>
          ) : (
            players.length > registryEntry.minPlayers && (
              <p className="mt-2 text-xs text-ink-muted">
                Can&apos;t go below {players.length} — that many players are already in the lobby.
              </p>
            )
          )}
        </div>
      )}

      {/*
        #329 — every player sees this now, not just the captain: the config
        value is replicated into room state (see `displayConfig`/the
        broadcast effect above), so a non-captain's read-only view shows the
        captain's actual live pick rather than a guessed default. `canEdit`
        (from #319's original slot API) is what makes it read-only for
        everyone but the captain — no panel-specific change needed for
        that half.

        Gated on `isCaptain || lobbyConfig !== null`: a non-captain renders
        nothing until the real value has arrived (see `lobbyConfig`'s own
        doc comment) rather than showing a value that might not match yet.

        #333 — slot is null only while the room has not loaded yet; render
        nothing for that window rather than guessing a game's panel.
      */}
      {slot && ConfigPanel && (isCaptain || lobbyConfig !== null) && (
        <div className="w-full max-w-sm">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
            {slot.title}
          </h3>
          <ConfigPanel
            config={displayConfig}
            onChange={setConfig}
            canEdit={isCaptain}
            context={configContext}
          />
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        {!isLocalPlayerReady && (
          <button
            onClick={onReady}
            className="press min-h-11 rounded-cab border-2 border-outline bg-accent px-8 py-3 font-bold text-accent-ink shadow-print-sm"
          >
            Ready
          </button>
        )}

        {isCaptain && isLocalPlayerReady && (
          <button
            onClick={handleStartGame}
            disabled={!canStart || isStarting || !slot}
            className="press min-h-11 rounded-cab border-2 border-outline bg-accent px-8 py-3 font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
          >
            {isStarting ? "Starting..." : slot ? slot.startLabel(effectiveConfig) : "Start Game"}
          </button>
        )}

        {isLocalPlayerReady && !allPlayersReady && (
          <p className="text-sm text-ink-muted">
            Waiting for {notReadyPlayerNames.join(", ")} to ready up...
          </p>
        )}

        {isLocalPlayerReady && allPlayersReady && !isCaptain && (
          <p className="text-sm text-ink-muted">
            Waiting for the host to start the game...
          </p>
        )}
      </div>
    </div>
  );
}
