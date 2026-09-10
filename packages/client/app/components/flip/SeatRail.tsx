"use client";

/**
 * Seat rail across the far edge (DESIGN-APPENDIX.md §8, invariant — true of
 * every game). Turn order, left to right, never reordered mid-game. Active
 * seat expands; others collapse to pawn/name/count. The active seat's 3px
 * `--warning` ring is, per §8's seat chip rules, "the only place that ring
 * is used in the entire product" — do not reuse it for anything else here.
 *
 * Flip has no hidden state (contract C1 does not apply — #362), so unlike
 * Wire's rack-based layout this is the whole per-seat surface; there is no
 * separate private rack to pin.
 */

import type { FlipSeat } from "./types";

export interface SeatRailProps {
  seats: FlipSeat[];
}

export function SeatRail({ seats }: SeatRailProps) {
  const ordered = [...seats].sort((a, b) => a.order - b.order);

  return (
    <ul className="flex flex-wrap justify-center gap-2" data-testid="seat-rail">
      {ordered.map((seat) => (
        <li
          key={seat.id}
          data-testid={`seat-${seat.id}`}
          data-active={seat.isActive}
          className={`flex items-center gap-2 rounded-cab border-2 bg-surface-raised px-3 py-2 shadow-print-sm transition-[flex-basis] ${
            seat.isActive
              ? "border-outline ring-[3px] ring-warning"
              : "border-outline"
          } ${seat.isBusted ? "opacity-60" : ""}`}
        >
          {/* Pawn — always survives truncation per seat chip rules. */}
          <span
            aria-hidden
            className="h-3 w-3 shrink-0 rounded-full bg-ink"
          />

          {seat.isDealer && (
            <span className="shrink-0 rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-ink">
              Dealer
            </span>
          )}

          <span className="min-w-0 truncate text-sm font-medium text-ink">
            {seat.name}
          </span>

          {seat.isFrozen && (
            <span
              title="Frozen — skipped this round"
              className="shrink-0 rounded-cab bg-info/15 px-1.5 py-0.5 text-xs font-medium text-info"
            >
              ❄ Frozen
            </span>
          )}

          {seat.isBusted && (
            <span
              title="Busted — 0 for this round"
              className="shrink-0 rounded-cab bg-danger/15 px-1.5 py-0.5 text-xs font-medium text-danger"
            >
              Busted
            </span>
          )}

          {/* Count — always survives truncation per seat chip rules. */}
          <span className="tabular shrink-0 text-xs text-ink-muted">
            {seat.cardCount}
          </span>
        </li>
      ))}
    </ul>
  );
}
