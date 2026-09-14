"use client";

interface LeaveGameWarningProps {
  /** Different consequence, different copy — captaincy never reassigns (#431's ruling), so the captain leaving closes the room outright rather than ending just the mission. */
  isCaptain: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * #432 — nothing rendered a way out of an ACTIVE Wire game at all before
 * this (Lobby's own leave, #451, only covers the pre-game phase). Leaving
 * mid-game is a destructive act on behalf of the three or four other
 * players still at the table, so this is a deliberately heavier warning
 * than Flip's plain confirm (#434) — it must say plainly what happens, not
 * just ask "are you sure?".
 *
 * Same blocking-scrim/alertdialog idiom as BustNotice and the dual-cut
 * response prompt in GameBoard (fixed inset-0, role="alertdialog") rather
 * than a native `window.confirm` — this codebase has no existing use of
 * the native dialog, and it can't carry the required explanation text or
 * match the house visual style.
 */
export function LeaveGameWarning({ isCaptain, onConfirm, onCancel }: LeaveGameWarningProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="leave-game-warning-heading"
    >
      <div className="w-full max-w-sm rounded-cab border-2 border-outline bg-surface-raised p-6 text-center shadow-print-md">
        <h2 id="leave-game-warning-heading" className="text-xl font-bold text-danger">
          Leave the game?
        </h2>
        {isCaptain ? (
          <p className="mt-3 text-sm text-ink-muted">
            You&apos;re the captain. Leaving now will{" "}
            <span className="font-semibold text-ink">close the room for everyone</span> — the other
            players will be disconnected and this game cannot be continued.
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            This will <span className="font-semibold text-ink">end the mission for everyone</span> at
            the table. The room stays open and everyone lands back in the lobby, but the mission itself
            will need to be restarted from scratch.
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="press flex-1 min-h-11 rounded-cab border-2 border-outline px-4 py-2 text-sm font-bold text-ink hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="press flex-1 min-h-11 rounded-cab border-2 border-outline bg-danger px-4 py-2 text-sm font-bold text-accent-ink shadow-print-sm"
          >
            {isCaptain ? "Close the Room" : "End the Mission"}
          </button>
        </div>
      </div>
    </div>
  );
}
