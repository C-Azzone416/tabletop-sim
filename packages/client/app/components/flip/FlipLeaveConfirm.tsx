"use client";

interface FlipLeaveConfirmProps {
  /** #431's "the host leaving closes the room" rule is universal — unconditional and identical across every game — so this still has to say so plainly, not just ask "are you sure?". Only the non-captain branch is #434's own "deliberately lighter" case. */
  isCaptain: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * #434 — a non-host leaving Flip is deliberately LIGHTER than Wire's
 * LeaveGameWarning (#432): a plain confirm, not a heavier warning, because
 * it costs the other players nothing — play continues, nobody is moved,
 * and the departed seat just shows as "Left" in the seat rail in real
 * time (see SeatRail.tsx / types.ts's FlipSeat.isLeft doc comment). No
 * separate notice for anyone else is needed the way Wire's
 * MissionEndedNotice is — the live seat-rail update IS the notification.
 *
 * The captain branch below is heavier (matching Wire's own captain
 * copy/severity) since that consequence is identical regardless of game —
 * kept local to this component rather than importing #432's
 * LeaveGameWarning, since these are two independent, unmerged PRs and a
 * shared new file between them is a real collision risk (this session hit
 * that exact class of problem more than once tonight) for what's a few
 * lines of copy, not shared logic.
 */
export function FlipLeaveConfirm({ isCaptain, onConfirm, onCancel }: FlipLeaveConfirmProps) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 ${isCaptain ? "bg-black/60" : "bg-black/30"}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="flip-leave-confirm-heading"
    >
      <div className="w-full max-w-xs rounded-cab border-2 border-outline bg-surface-raised p-5 text-center shadow-print-md">
        <h2
          id="flip-leave-confirm-heading"
          className={`text-lg font-bold ${isCaptain ? "text-danger" : "text-ink"}`}
        >
          Leave the game?
        </h2>
        {isCaptain ? (
          <p className="mt-2 text-sm text-ink-muted">
            You&apos;re the host. Leaving now will{" "}
            <span className="font-semibold text-ink">close the room for everyone</span> — the other
            players will be disconnected and this game cannot be continued.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">
            Play continues for everyone else — you&apos;ll just be marked as left.
          </p>
        )}
        <div className="mt-5 flex gap-3">
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
            className={`press flex-1 min-h-11 rounded-cab border-2 border-outline px-4 py-2 text-sm font-bold shadow-print-sm ${
              isCaptain ? "bg-danger text-accent-ink" : "bg-accent text-accent-ink"
            }`}
          >
            {isCaptain ? "Close the Room" : "Leave"}
          </button>
        </div>
      </div>
    </div>
  );
}
