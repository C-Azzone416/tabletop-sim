/**
 * DRAFT — mirrors the Flip `game_state` payload shape agreed with dingo on
 * `control` (#382/#383, 2026-09-10 ~07:56Z), not an import from
 * @tabletop/shared: #382 hasn't pushed yet, so this tracks the agreed wire
 * contract now instead of waiting. Once #382 merges and `@tabletop/shared`
 * exports the real `FlipTableView`, importing that instead of this file is
 * a type-only swap at each call site below, not a reshape — same pattern
 * engine-types.ts used ahead of #360/#361.
 *
 * DO NOT extend or diverge from this file without re-checking control.
 */

export type FlipPlayerStatus = "active" | "frozen" | "busted";
export type FlipPhase = "awaiting-round-start" | "round-in-progress" | "round-over" | "game-over";

export type FlipModifierValue = "+2" | "+4" | "+6" | "+8" | "+10" | "x2";
export type FlipActionValue = "freeze" | "flip3" | "second-chance";

export type FlipCardInstance =
  | { id: string; kind: "number"; value: number }
  | { id: string; kind: "modifier"; modifier: FlipModifierValue }
  | { id: string; kind: "action"; action: FlipActionValue };

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

export interface FlipTableViewPlayer {
  id: string;
  name: string;
  status: FlipPlayerStatus;
  hand: FlipCardInstance[];
  totalScore: number;
  uniqueNumberCount: number;
}

export interface FlipTableView {
  phase: FlipPhase;
  roundNumber: number;
  dealerId: string;
  turnPlayerId: string | null;
  players: FlipTableViewPlayer[];
  shoeRemaining: number;
  discardCount: number;
  pendingAction: { kind: "freeze" | "flip3"; flipperId: string; eligibleTargetIds: string[] } | null;
  flip3Stack: Array<{ targetId: string; remaining: number }>;
  lastRoundResult: { roundNumber: number; scores: Record<string, number>; flip7PlayerId: string | null } | null;
  winnerId: string | null;
  resolutionLog: FlipResolutionEvent[];
}
