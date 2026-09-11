/**
 * #410: who owes the next action on this table, if anyone.
 *
 * The flipper owed a Freeze/Flip 3 target choice is NOT always the
 * turn-holder — that's the case the dev view rendered zero controls for
 * (Caroline: "not the same controls obviously, but not zero controls
 * required"), so pendingAction is checked first, ahead of turnPlayerId.
 * awaiting-round-start owes the dealer a Start Round, the same wall as a
 * missing turn-holder for the same reason. round-over (scoring) and
 * game-over owe nobody — the dev view should hold still there, not jump.
 */

export interface ActingSeatFlipView {
  readonly phase: "awaiting-round-start" | "round-in-progress" | "round-over" | "game-over";
  readonly dealerId: string;
  readonly turnPlayerId: string | null;
  readonly pendingAction: { readonly flipperId: string } | null;
}

export function actingPlayerId(flip: ActingSeatFlipView): string | null {
  if (flip.pendingAction) return flip.pendingAction.flipperId;
  if (flip.phase === "awaiting-round-start") return flip.dealerId;
  if (flip.phase === "round-in-progress") return flip.turnPlayerId;
  return null;
}
