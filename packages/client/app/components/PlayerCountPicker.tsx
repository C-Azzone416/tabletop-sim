"use client";

import type { GameRegistryEntry } from "@tabletop/shared";

interface PlayerCountPickerProps {
  game: GameRegistryEntry;
  value: number;
  onChange: (count: number) => void;
  disabled?: boolean;
}

/**
 * #437 — the host's player-count choice at game selection. A fixed-size game
 * (minPlayers === maxPlayers, e.g. Spades 4-4) has nothing to choose, so it
 * renders as a statement, not a one-option control (explicit AC). Otherwise
 * one button per count in the registry's [minPlayers, maxPlayers] range —
 * the range itself always comes from the registry, never a literal.
 */
export function PlayerCountPicker({ game, value, onChange, disabled = false }: PlayerCountPickerProps) {
  if (game.minPlayers === game.maxPlayers) {
    return (
      <p className="text-sm text-ink-muted">{game.minPlayers} players</p>
    );
  }

  const counts = Array.from(
    { length: game.maxPlayers - game.minPlayers + 1 },
    (_, i) => game.minPlayers + i,
  );

  return (
    <div className="flex flex-wrap gap-2">
      {counts.map((count) => (
        <button
          key={count}
          type="button"
          onClick={() => onChange(count)}
          disabled={disabled}
          aria-pressed={value === count}
          className={`press min-h-11 min-w-11 rounded-cab border-2 px-4 py-2 font-bold shadow-print-sm disabled:cursor-not-allowed disabled:opacity-50 ${
            value === count
              ? "border-outline bg-accent text-accent-ink"
              : "border-outline bg-surface-raised text-ink"
          }`}
        >
          {count}
        </button>
      ))}
    </div>
  );
}
