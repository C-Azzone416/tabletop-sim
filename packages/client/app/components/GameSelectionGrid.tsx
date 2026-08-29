"use client";

import { GAME_REGISTRY, type GameRegistryEntry } from "@tabletop/shared";

interface GameSelectionGridProps {
  onSelect: (game: GameRegistryEntry) => void;
  disabled?: boolean;
}

export function GameSelectionGrid({ onSelect, disabled = false }: GameSelectionGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {GAME_REGISTRY.map((game) => (
        <button
          key={game.id}
          type="button"
          onClick={() => game.available && onSelect(game)}
          disabled={!game.available || disabled}
          aria-disabled={!game.available}
          className="press flex flex-col items-start gap-2 rounded-cab border-2 border-outline bg-surface-raised p-4 text-left shadow-print-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex w-full items-center justify-between">
            <span className="font-bold text-ink">{game.displayName}</span>
            {!game.available && (
              <span className="rounded-cab border border-outline bg-surface px-2 py-0.5 text-xs font-medium text-ink-muted">
                Coming soon
              </span>
            )}
          </div>
          <span className="text-sm text-ink-muted">
            {game.minPlayers === game.maxPlayers
              ? `${game.minPlayers} players`
              : `${game.minPlayers}–${game.maxPlayers} players`}
          </span>
          <p className="text-sm text-ink-muted">{game.description}</p>
        </button>
      ))}
    </div>
  );
}
