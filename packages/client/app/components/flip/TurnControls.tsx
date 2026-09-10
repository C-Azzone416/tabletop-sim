"use client";

/**
 * Hit / Freeze — the active player's two turn actions (#362 acceptance:
 * "disabled and invisible for non-active players"). Renders nothing at all
 * when it isn't the local player's turn, or while a Freeze/Flip3 target
 * choice is pending — that's #363's targeting UI surface (see PendingActionSlot),
 * not a state this component tries to represent.
 *
 * Calls only the two engine entry points that belong to this ticket
 * (`hit`/`freeze` per bobcat's #360 draft surface); target-choice calls
 * (`chooseFreezeTarget`/`chooseFlip3Target`) are #363's, not wired here.
 */

export interface TurnControlsProps {
  isMyTurn: boolean;
  pendingAction: { kind: "freeze" } | { kind: "flip3" } | null;
  onHit: () => void;
  onFreeze: () => void;
}

export function TurnControls({ isMyTurn, pendingAction, onHit, onFreeze }: TurnControlsProps) {
  if (!isMyTurn || pendingAction) return null;

  return (
    <div className="flex justify-center gap-3" data-testid="turn-controls">
      <button
        type="button"
        onClick={onHit}
        className="press rounded-cab border-2 border-outline bg-accent px-6 py-3 text-base font-bold text-accent-ink shadow-print-md"
      >
        Hit
      </button>
      <button
        type="button"
        onClick={onFreeze}
        className="press rounded-cab border-2 border-outline bg-surface-raised px-6 py-3 text-base font-bold text-ink shadow-print-md"
      >
        Freeze
      </button>
    </div>
  );
}
