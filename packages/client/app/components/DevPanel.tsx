"use client";

import { useState } from "react";

export interface DevPanelSeat {
  name: string;
  profileId: string;
}

interface DevPanelProps {
  seatOptions: DevPanelSeat[];
  activeProfileId: string;
  onSwitchSeat: (seat: DevPanelSeat) => void;
  onRevealAllTokens?: () => void;
  onSkipTurn?: () => void;
}

// #144 (Caroline, 2026-07-23): consolidates what used to be separate
// always-visible, semi-transparent controls (SeatSwitcher + the reveal/
// skip-turn buttons) into one collapsed-by-default panel, opaque when open.
// Anchored top-right rather than a bottom corner: ActionPanel (Dual Cut /
// Solo Cut / Double Detector) is the last block in GameBoard's normal
// document flow, so on a short viewport a bottom-fixed panel ends up
// sitting directly on top of it once the player scrolls down to act —
// confirmed by screenshot during review. Nothing else claims the top-right
// corner (JoinCodeBadge is top-left, ErrorToast is top-center).
//
// #171: must stack ABOVE full-screen overlay backdrops (GameOverOverlay and
// the GameBoard dialogs, all z-50) — dev tools have to stay usable in every
// game state, e.g. switching to the captain seat during game-over to drive
// next_mission. z-[60] shares ErrorToast's layer; they never overlap
// geometrically (top-center vs top-right).
export function DevPanel({
  seatOptions,
  activeProfileId,
  onSwitchSeat,
  onRevealAllTokens,
  onSkipTurn,
}: DevPanelProps) {
  const [open, setOpen] = useState(false);

  // #149: which seat you're viewing must be obvious without opening the
  // panel — Caroline got stranded viewing as a non-turn-holder seat with no
  // visible explanation. Shown on the collapsed toggle itself.
  const activeSeatName = seatOptions.find((s) => s.profileId === activeProfileId)?.name;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open dev tools"
        className="fixed top-24 right-4 z-[60] rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 font-mono text-xs font-medium text-amber-800 shadow-md hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
      >
        [DEV]{activeSeatName && ` Viewing: ${activeSeatName}`}
      </button>
    );
  }

  return (
    <div className="fixed top-24 right-4 z-[60] flex max-w-xs flex-col gap-3 rounded-lg border border-amber-400 bg-white p-3 font-mono text-xs shadow-lg dark:border-amber-600 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-amber-800 dark:text-amber-400">
          [DEV] Tools{activeSeatName && ` — Viewing: ${activeSeatName}`}
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close dev tools"
          className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ×
        </button>
      </div>

      {seatOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-zinc-500 dark:text-zinc-400">Seat:</span>
          <div className="flex flex-wrap gap-1">
            {seatOptions.map((seat) => (
              <button
                key={seat.profileId}
                onClick={() => onSwitchSeat(seat)}
                disabled={seat.profileId === activeProfileId}
                className={`rounded px-2 py-1 ${
                  seat.profileId === activeProfileId
                    ? "bg-amber-600 text-white"
                    : "border border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
                }`}
              >
                {seat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {onRevealAllTokens && (
          <button
            onClick={onRevealAllTokens}
            className="rounded border border-amber-300 px-2 py-1 text-left text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
          >
            Reveal All Tokens
          </button>
        )}
        {onSkipTurn && (
          <button
            onClick={onSkipTurn}
            className="rounded border border-amber-300 px-2 py-1 text-left text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
          >
            Skip Turn
          </button>
        )}
      </div>
    </div>
  );
}
