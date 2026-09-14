"use client";

import type { GameRegistryEntry } from "@tabletop/shared";

interface PlayerCountPickerProps {
  game: GameRegistryEntry;
  value: number;
  onChange: (count: number) => void;
  disabled?: boolean;
  /**
   * #438 — the lobby's resize control refuses to lower the count below the
   * room's current occupancy (Caroline's ruling: refuse, don't eject).
   * Counts below this are individually disabled, even while the rest of
   * the picker is editable, rather than the whole control locking just
   * because one option in range isn't currently legal.
   */
  minSelectable?: number;
}

/**
 * #437 — the host's player-count choice at game selection. A fixed-size game
 * (minPlayers === maxPlayers, e.g. Spades 4-4) has nothing to choose, so it
 * renders as a statement, not a one-option control (explicit AC). Otherwise
 * one button per count in the registry's [minPlayers, maxPlayers] range —
 * the range itself always comes from the registry, never a literal.
 */
export function PlayerCountPicker({ game, value, onChange, disabled = false, minSelectable }: PlayerCountPickerProps) {
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
      {counts.map((count) => {
        const belowOccupancy = minSelectable !== undefined && count < minSelectable;
        return (
          <button
            key={count}
            type="button"
            onClick={() => onChange(count)}
            disabled={disabled || belowOccupancy}
            aria-pressed={value === count}
            title={belowOccupancy ? `${minSelectable} players are already in the lobby` : undefined}
            className={`press min-h-11 min-w-11 rounded-cab border-2 px-4 py-2 font-bold shadow-print-sm disabled:cursor-not-allowed disabled:opacity-50 ${
              value === count
                ? "border-outline bg-accent text-accent-ink"
                : "border-outline bg-surface-raised text-ink"
            }`}
          >
            {count}
          </button>
        );
      })}
    </div>
  );
}
