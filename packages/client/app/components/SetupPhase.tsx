"use client";

import type { Game, Player, Wire, InfoToken } from "@tabletop/shared";
import { PlayerRack } from "./PlayerRack";

interface SetupPhaseProps {
  game: Game;
  players: Player[];
  wires: Wire[];
  infoTokens: InfoToken[];
  localPlayerId: string;
  onPlaceInfoToken: (wireId: string) => void;
}

// Board-first, turn-ordered opening info-token placement (captain places
// first, then clockwise — game-engine.ts's advanceTurn does the rotation,
// same helper real gameplay turns already use). The interrogation exchange
// (asking an opponent about a wire) is a separate, currently out-of-scope
// mechanic — see #setup-flow-fix — deliberately not wired in here yet so it
// can slot in later as either an interleaved or a separate step without
// reworking this placement flow.
export function SetupPhase({
  game,
  players,
  wires,
  infoTokens,
  localPlayerId,
  onPlaceInfoToken,
}: SetupPhaseProps) {
  const isLocalPlayerActivePlacer = game.currentTurnPlayerId === localPlayerId;
  const activePlacer = players.find((p) => p.id === game.currentTurnPlayerId);

  const localWireIds = new Set(
    wires.filter((w) => w.playerId === localPlayerId).map((w) => w.id)
  );
  const hasPlacedOpeningToken = infoTokens.some((t) => localWireIds.has(t.wireId));

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Place Your Opening Info Token
        </h2>

        {/* Turn Indicator */}
        <div className="mt-3 rounded-lg bg-blue-100 px-4 py-2 dark:bg-blue-900">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            {isLocalPlayerActivePlacer
              ? "Your turn — place your opening info token"
              : `Waiting for ${activePlacer?.name ?? "..."} to place their token...`}
          </p>
        </div>
      </div>

      <div className="w-full max-w-4xl space-y-6">
        {players.map((player) => {
          const playerWires = wires
            .filter((w) => w.playerId === player.id)
            .sort((a, b) => a.rackPosition - b.rackPosition);
          const isLocal = player.id === localPlayerId;
          const canPlaceOpeningToken =
            isLocal && isLocalPlayerActivePlacer && !hasPlacedOpeningToken;
          const selectableWireIds = canPlaceOpeningToken
            ? playerWires.filter((w) => w.color === "blue").map((w) => w.id)
            : undefined;

          return (
            <div key={player.id}>
              <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {isLocal ? "Your Rack" : player.name}
              </h3>
              {isLocal && (
                <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                  {hasPlacedOpeningToken
                    ? "Opening info token placed."
                    : isLocalPlayerActivePlacer
                    ? "Select one of your blue wires to place your opening info token."
                    : "Waiting for your turn to place your opening info token."}
                </p>
              )}
              <PlayerRack
                wires={playerWires}
                isLocal={isLocal}
                selectableWireIds={selectableWireIds}
                onSelectWire={canPlaceOpeningToken ? onPlaceInfoToken : undefined}
                infoTokens={infoTokens}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
