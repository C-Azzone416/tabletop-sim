"use client";

import { useState } from "react";
import { getGameById } from "@tabletop/shared";
import type { Player } from "@tabletop/shared";
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
        Captain-only, exactly as before #319. The config value is local to the
        captain's client and is not replicated in room state, so a "read-only
        for everyone else" view would show every non-captain a default rather
        than the captain's actual choice. The slot API already carries
        `canEdit` and each panel implements it, so once the config lives in
        room state this becomes `<div>` unconditionally with
        `canEdit={isCaptain}`.
      */}
      {/* #333 — slot is null only while the room has not loaded yet; render
          nothing for that window rather than guessing a game's panel. */}
      {isCaptain && slot && ConfigPanel && (
        <div className="w-full max-w-sm">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
            {slot.title}
          </h3>
          <ConfigPanel
            config={effectiveConfig}
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
