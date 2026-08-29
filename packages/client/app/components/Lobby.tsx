"use client";

import { useState } from "react";
import type { Player } from "@tabletop/shared";
import { resolveLobbyConfigSlot } from "./lobbyConfig/registry";
import type { LobbyStartArg } from "./lobbyConfig/types";

interface LobbyProps {
  joinCode: string;
  players: Player[];
  localPlayerId: string;
  captainId: string | null;
  onReady: () => void;
  onStartGame: (startArg: LobbyStartArg) => void;
  // #179: {1..highestUnlocked} are pickable for the captain.
  highestUnlocked: number;
  /**
   * The room's `game_type`, which picks the config panel (#319). Null until
   * #313/#325 puts `gameType` in room state — see `resolveLobbyConfigSlot`.
   */
  gameType?: string | null;
}

export function Lobby({
  joinCode,
  players,
  localPlayerId,
  captainId,
  onReady,
  onStartGame,
  highestUnlocked,
  gameType = null,
}: LobbyProps) {
  const isCaptain = localPlayerId === captainId;
  const localPlayer = players.find((p) => p.id === localPlayerId);
  const isLocalPlayerReady = localPlayer?.ready ?? false;
  const allPlayersReady = players.every((p) => p.ready);
  const notReadyPlayerNames = players.filter((p) => !p.ready).map((p) => p.name);
  const canStart = players.length >= 1 && players.length <= 4 && allPlayersReady;
  const [isStarting, setIsStarting] = useState(false);

  // #319: the lobby holds the config value but never interprets it — the slot
  // for the room's game type owns its shape, its panel, its start label and
  // how it maps onto onStartGame. Adding a game must not touch this file.
  const configContext = { highestUnlocked };
  const slot = resolveLobbyConfigSlot(gameType);
  const [config, setConfig] = useState<unknown>(() =>
    slot.createDefaultConfig(configContext),
  );
  const [configGameId, setConfigGameId] = useState(slot.gameId);

  // Reset the config when the slot changes rather than keeping one game's
  // value under another game's panel. This fires in practice when gameType
  // arrives after the first render (the room state has not loaded yet).
  if (configGameId !== slot.gameId) {
    setConfigGameId(slot.gameId);
    setConfig(slot.createDefaultConfig(configContext));
  }

  const ConfigPanel = slot.Panel;

  const handleStartGame = () => {
    if (isStarting) return;
    setIsStarting(true);
    onStartGame(slot.toStartArg(config));
  };

  return (
    <div className="flex flex-col items-center gap-8 p-8">
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
          Players ({players.length}/4)
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
        Captain-only, exactly as before #319. The config value is local to the
        captain's client and is not replicated in room state, so a "read-only
        for everyone else" view would show every non-captain a default rather
        than the captain's actual choice. The slot API already carries
        `canEdit` and each panel implements it, so once the config lives in
        room state this becomes `<div>` unconditionally with
        `canEdit={isCaptain}`.
      */}
      {isCaptain && (
        <div className="w-full max-w-sm">
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
            {slot.title}
          </h3>
          <ConfigPanel
            config={config}
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
            disabled={!canStart || isStarting}
            className="press min-h-11 rounded-cab border-2 border-outline bg-accent px-8 py-3 font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
          >
            {isStarting ? "Starting..." : slot.startLabel(config)}
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
