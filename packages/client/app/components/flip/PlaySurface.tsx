"use client";

/**
 * Contract C2 play surface (DESIGN-APPENDIX.md §8): 7° tilt by default, 0°
 * with the flatten toggle, eases to 0° when a tile is zoomed, never animates
 * mid-turn, and its max width is driven by seat count (§8 "Seat counts"
 * table). No existing component implements this — Wire's GameBoard.tsx is a
 * plain flex column with no spatial surface — so this originates the
 * pattern rather than reusing one.
 *
 * Generic and game-agnostic on purpose: it knows nothing about Flip's cards,
 * only the seat count and turn/zoom state, so any future spatial-surface
 * game (C2) can reuse it unchanged.
 */

import type { ReactNode } from "react";

const MAX_WIDTH_BY_SEAT_COUNT: Record<2 | 3 | 4 | 5, number> = {
  2: 640,
  3: 600,
  4: 560,
  5: 520,
};

export interface PlaySurfaceProps {
  /** Total seats in this game, 2-5 — drives the max-width table. */
  seatCount: 2 | 3 | 4 | 5;
  /** User-controlled flatten toggle. 0° when true, 7° otherwise. */
  flattened: boolean;
  onToggleFlatten: () => void;
  /**
   * True while a tile/card is zoomed — the surface eases to 0° regardless
   * of `flattened`, per §8's "eases to 0° when a tile is zoomed."
   */
  zoomed?: boolean;
  /**
   * True while the active player's turn is resolving. Tilt must never
   * animate mid-turn, so the transition is suppressed while this is set.
   */
  turnInProgress?: boolean;
  children: ReactNode;
}

export function PlaySurface({
  seatCount,
  flattened,
  onToggleFlatten,
  zoomed = false,
  turnInProgress = false,
  children,
}: PlaySurfaceProps) {
  const tilted = !flattened && !zoomed;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-full"
        style={{ maxWidth: MAX_WIDTH_BY_SEAT_COUNT[seatCount] }}
      >
        <div style={{ perspective: "1400px" }}>
          <div
            data-testid="play-surface"
            data-tilted={tilted}
            className="rounded-cab border-2 border-outline bg-game-table p-4 shadow-print-md"
            style={{
              transform: tilted ? "rotateX(7deg)" : "rotateX(0deg)",
              transformOrigin: "50% 100%",
              // §8: "Tilt never animates during a turn." Zero-duration
              // transition mid-turn, normal easing otherwise (flatten
              // toggle, zoom-in/out).
              transition: turnInProgress
                ? "none"
                : "transform var(--t-base) var(--ease)",
            }}
          >
            {children}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleFlatten}
        aria-pressed={flattened}
        className="press rounded-cab border-2 border-outline bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink shadow-print-sm"
      >
        {flattened ? "Tilt table" : "Flatten table"}
      </button>
    </div>
  );
}
