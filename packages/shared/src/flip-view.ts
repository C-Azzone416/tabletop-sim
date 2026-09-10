// #382 — the Flip table as it goes over the wire.
//
// These live in @tabletop/shared, not in @tabletop/game-flip, and that is
// forced by the dependency graph rather than chosen: game-flip depends on
// shared (for shuffleCards), and the client depends only on shared. Putting
// them here is the only arrangement that lets both the server and the client
// name the same type without a cycle.
//
// It is also the right boundary independently: this is a transport DTO, not
// engine state. The server maps the engine's FlipGameState onto it, which
// means the engine can change its internals without breaking the wire format —
// and, more importantly, lets the mapping DROP things clients must not see.
// A compile-time compatibility check in the server keeps the two from drifting
// silently (packages/server/test/flip-view-compat.test.ts).

export type FlipNumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type FlipModifierValue = '+2' | '+4' | '+6' | '+8' | '+10' | 'x2';
export type FlipActionKind = 'freeze' | 'flip3' | 'second-chance';

export type FlipCardView =
  | { readonly kind: 'number'; readonly value: FlipNumberValue; readonly id: string }
  | { readonly kind: 'modifier'; readonly modifier: FlipModifierValue; readonly id: string }
  | { readonly kind: 'action'; readonly action: FlipActionKind; readonly id: string };

export type FlipPlayerStatusView = 'active' | 'frozen' | 'busted';

export type FlipPhaseView =
  | 'awaiting-round-start'
  | 'round-in-progress'
  | 'round-over'
  | 'game-over';

export type FlipCardEffectView =
  | 'number-added'
  | 'number-busted'
  | 'number-saved'
  | 'number-flip7'
  | 'modifier-added'
  | 'second-chance-gained'
  | 'second-chance-discarded'
  | 'freeze-drawn'
  | 'flip3-drawn';

/** One step of what the most recent action did, for narrating a Flip 3 (#363). */
export interface FlipResolutionEventView {
  readonly targetId: string;
  readonly card: FlipCardView;
  readonly effect: FlipCardEffectView;
  readonly context: 'deal' | 'hit' | 'flip3';
}

export interface FlipPlayerView {
  readonly id: string;
  readonly name: string;
  readonly status: FlipPlayerStatusView;
  /**
   * Face up to everyone. Flip has no hidden state (#358) — design contract C1
   * does not apply — so unlike the wire game there is no per-player redaction
   * and every seat receives every hand in full.
   */
  readonly hand: readonly FlipCardView[];
  /** Cumulative across rounds, not this round's score. */
  readonly totalScore: number;
  /** Unique number-card values held: 0 counts, modifiers never do (#358). */
  readonly uniqueNumberCount: number;
}

/**
 * A Freeze or Flip 3 that has been drawn and is waiting on its target choice.
 *
 * `eligibleTargetIds` is resolved server-side from the engine's own eligibility
 * rule (active seats only; a lone eligible flipper must take it themselves) so
 * the targeting UI (#363) renders a list rather than re-implementing the rule.
 */
export interface FlipPendingActionView {
  readonly kind: 'freeze' | 'flip3';
  readonly flipperId: string;
  readonly eligibleTargetIds: readonly string[];
}

export interface FlipThreeLevelView {
  readonly targetId: string;
  readonly remaining: number;
}

export interface FlipRoundResultView {
  readonly roundNumber: number;
  readonly scores: Readonly<Record<string, number>>;
  readonly flip7PlayerId: string | null;
}

export interface FlipTableView {
  readonly phase: FlipPhaseView;
  readonly roundNumber: number;
  /** Resolved from the engine's dealerIndex so the client never does seat math. */
  readonly dealerId: string;
  readonly turnPlayerId: string | null;
  readonly players: readonly FlipPlayerView[];
  /**
   * How many cards are left to draw — NOT the cards themselves. The undrawn
   * shoe is the one genuinely hidden thing in this game; sending it would hand
   * every client the whole future of the round.
   */
  readonly shoeRemaining: number;
  /**
   * A count, not the pile. #358 rules the discard is not browsable — "memory
   * stays a skill" — so the pile is persisted for the reshuffle but never
   * broadcast.
   */
  readonly discardCount: number;
  readonly pendingAction: FlipPendingActionView | null;
  readonly flip3Stack: readonly FlipThreeLevelView[];
  readonly lastRoundResult: FlipRoundResultView | null;
  readonly winnerId: string | null;
  /** What the most recent action did, in order. Reset per action, not a history. */
  readonly resolutionLog: readonly FlipResolutionEventView[];
}
