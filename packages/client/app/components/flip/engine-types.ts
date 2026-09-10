/**
 * DRAFT — mirrors bobcat's #360 engine shape as relayed by dingo on
 * `control` (2026-09-10 ~06:11Z), not an import from a landed package.
 * #360 hasn't merged yet, so this is duplicated here on purpose rather than
 * imported: it lets #362 build against the real field names now instead of
 * a hand-rolled guess, while keeping the swap to the eventual
 * `packages/games/flip` export a type-only import change in the components
 * below, not a reshape of their internals.
 *
 * DO NOT extend or diverge from this file without re-checking control —
 * it exists to track bobcat's shape, not to define a competing one.
 */

export type FlipPlayerStatus = "active" | "frozen" | "busted";

export type FlipPhase =
  | "awaiting-round-start"
  | "round-in-progress"
  | "round-over"
  | "game-over";

export type FlipModifierValue = "+2" | "+4" | "+6" | "+8" | "+10" | "x2";
export type FlipActionValue = "freeze" | "flip3" | "second-chance";

export type FlipCardInstance =
  | { id: string; kind: "number"; value: number }
  | { id: string; kind: "modifier"; modifier: FlipModifierValue }
  | { id: string; kind: "action"; action: FlipActionValue };

export interface FlipPlayerState {
  id: string;
  name: string;
  status: FlipPlayerStatus;
  hand: readonly FlipCardInstance[];
  totalScore: number;
}

/**
 * What resolving one drawn card did, for #363's narration — mirrors
 * @tabletop/game-flip's FlipCardEffect/FlipResolutionEvent (#360, merged to
 * develop 2026-09-10 as 6600a49). Added here, not backfilled onto every
 * existing FlipGameState fixture, hence optional on FlipGameState below.
 */
export type FlipResolutionEffect =
  | "number-added"
  | "number-busted"
  | "number-saved"
  | "number-flip7"
  | "modifier-added"
  | "second-chance-gained"
  | "second-chance-discarded"
  | "freeze-drawn"
  | "flip3-drawn";

export interface FlipResolutionEvent {
  targetId: string;
  card: FlipCardInstance;
  effect: FlipResolutionEffect;
  context: "deal" | "hit" | "flip3";
}

export interface FlipGameState {
  players: readonly FlipPlayerState[];
  dealerIndex: number;
  roundNumber: number;
  shoe: readonly FlipCardInstance[];
  discard: readonly FlipCardInstance[];
  phase: FlipPhase;
  turnPlayerId: string | null;
  pendingAction: { kind: "freeze" } | { kind: "flip3" } | null;
  flip3Stack: readonly { targetId: string; remaining: number }[];
  lastRoundResult: {
    roundNumber: number;
    scores: Record<string, number>;
    flip7PlayerId: string | null;
  } | null;
  winnerId: string | null;
  /**
   * Optional — added for #363 after this file was first drafted. The real
   * engine (@tabletop/game-flip) always provides it; kept optional here so
   * #362's existing fixtures that predate this field still typecheck.
   */
  resolutionLog?: readonly FlipResolutionEvent[];
}
