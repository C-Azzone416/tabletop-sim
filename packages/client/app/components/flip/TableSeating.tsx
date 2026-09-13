/**
 * #422 — replaces the old "one row per player" stack inside PlaySurface with
 * an actual seat-around-the-table arrangement: the local player's hand
 * anchors full-width at the bottom (front), opponents take the remaining
 * compass points based on how many there are. Every hand renders in full
 * (never collapsed to a count) — reading the whole table, not just your own
 * cards, is core to this game's skill (Caroline, 2026-09-13).
 *
 * Turn order (left-to-right, fixed for the game — DESIGN-APPENDIX.md §8) is
 * preserved, just rotated so the local seat is always first: opponents are
 * listed in turn order starting immediately after the local player and
 * wrapping around, matching how a real table reads clockwise from your seat.
 */

import { Hand } from "./Hand";
import type { FlipCardInstance } from "./engine-types";

export interface TableSeatingPlayer {
  readonly id: string;
  readonly name: string;
  readonly hand: readonly FlipCardInstance[];
}

export interface TableSeatingProps {
  players: readonly TableSeatingPlayer[];
  localPlayerId: string;
}

interface SeatPosition {
  readonly gridRow: number;
  readonly gridColumn: string;
}

// Row 1 = far edge, row 2 = mid edges, row 3 = local. A lone opponent spans
// the full far edge rather than sitting alone in the center column, so a
// 2-player table reads as a symmetric face-off, not an off-center card.
const OPPONENT_POSITIONS: Readonly<Record<1 | 2 | 3 | 4, readonly SeatPosition[]>> = {
  1: [{ gridRow: 1, gridColumn: "1 / span 3" }],
  2: [
    { gridRow: 1, gridColumn: "1" },
    { gridRow: 1, gridColumn: "3" },
  ],
  3: [
    { gridRow: 2, gridColumn: "1" },
    { gridRow: 1, gridColumn: "2" },
    { gridRow: 2, gridColumn: "3" },
  ],
  4: [
    { gridRow: 2, gridColumn: "1" },
    { gridRow: 1, gridColumn: "1" },
    { gridRow: 1, gridColumn: "3" },
    { gridRow: 2, gridColumn: "3" },
  ],
};

/** Rotates the turn-order list so `localPlayerId` is first, order otherwise unchanged. */
function rotateToLocal<T extends { id: string }>(players: readonly T[], localPlayerId: string): T[] {
  const localIndex = players.findIndex((p) => p.id === localPlayerId);
  if (localIndex <= 0) return [...players];
  return [...players.slice(localIndex), ...players.slice(0, localIndex)];
}

export function TableSeating({ players, localPlayerId }: TableSeatingProps) {
  const [local, ...opponents] = rotateToLocal(players, localPlayerId);
  const positions = OPPONENT_POSITIONS[Math.min(opponents.length, 4) as 1 | 2 | 3 | 4] ?? [];

  return (
    <div
      data-testid="table-seating"
      className="grid gap-4"
      style={{ gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "auto auto auto" }}
    >
      {opponents.map((player, i) => {
        const position = positions[i];
        if (!position) return null;
        return (
          <div
            key={player.id}
            data-testid={`seat-${player.id}`}
            style={{ gridRow: position.gridRow, gridColumn: position.gridColumn }}
            className="flex flex-col items-center gap-1"
          >
            <p className="text-xs font-medium text-ink-muted">{player.name}</p>
            <Hand cards={player.hand} />
          </div>
        );
      })}

      {local && (
        <div
          data-testid={`seat-${local.id}`}
          style={{ gridRow: 3, gridColumn: "1 / span 3" }}
          className="flex flex-col items-center gap-1"
        >
          <p className="text-xs font-medium text-ink-muted">You</p>
          <Hand cards={local.hand} />
        </div>
      )}
    </div>
  );
}
