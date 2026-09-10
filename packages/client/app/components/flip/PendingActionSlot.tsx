/**
 * Mount point for #363's targeting UI (Freeze/Flip 3 target choice).
 * #362 owns rendering *whether* a choice is pending; #363 owns *what* the
 * picker looks like. Proposed on control (2026-09-10) so the two tickets
 * don't collide — bobcat, replace `children` here with the real picker
 * rather than adding a competing pending-action element elsewhere.
 */

import type { ReactNode } from "react";

export interface PendingActionSlotProps {
  pendingAction: { kind: "freeze" } | { kind: "flip3" } | null;
  children?: ReactNode;
}

export function PendingActionSlot({ pendingAction, children }: PendingActionSlotProps) {
  if (!pendingAction) return null;

  return (
    <div
      data-testid="flip-pending-action"
      data-pending-action-kind={pendingAction.kind}
      className="rounded-cab border-2 border-outline bg-surface-raised p-3 text-center shadow-print-sm"
    >
      {children ?? (
        <p className="text-sm text-ink-muted">
          Waiting on a {pendingAction.kind === "freeze" ? "Freeze" : "Flip 3"} target…
        </p>
      )}
    </div>
  );
}
