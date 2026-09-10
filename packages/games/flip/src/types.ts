export type FlipNumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export const FLIP_MODIFIER_VALUES = ['+2', '+4', '+6', '+8', '+10', 'x2'] as const;
export type FlipModifierValue = (typeof FLIP_MODIFIER_VALUES)[number];
export const FLIP_ACTION_KINDS = ['freeze', 'flip3', 'second-chance'] as const;
export type FlipActionKind = (typeof FLIP_ACTION_KINDS)[number];

export interface FlipNumberCardDefinition {
  readonly kind: 'number';
  readonly value: FlipNumberValue;
}

export interface FlipModifierCardDefinition {
  readonly kind: 'modifier';
  readonly modifier: FlipModifierValue;
}

export interface FlipActionCardDefinition {
  readonly kind: 'action';
  readonly action: FlipActionKind;
}

export type FlipCardDefinition =
  | FlipNumberCardDefinition
  | FlipModifierCardDefinition
  | FlipActionCardDefinition;

/** Unique within one game's persistent shoe/discard pile. */
export type FlipCardInstance = FlipCardDefinition & { readonly id: string };

export type FlipPlayerStatus = 'active' | 'frozen' | 'busted';

export interface FlipPlayer {
  readonly id: string;
  readonly name: string;
}

export interface FlipPlayerState extends FlipPlayer {
  readonly status: FlipPlayerStatus;
  readonly hand: readonly FlipCardInstance[];
  readonly totalScore: number;
}

/**
 * An action card (Freeze or Flip 3) drawn but not yet resolved because it
 * requires an explicit target choice from the current turn player.
 */
export type FlipPendingAction =
  | { readonly kind: 'freeze' }
  | { readonly kind: 'flip3' };

/**
 * One outstanding level of a Flip 3 resolution. `flip3Stack` is a stack —
 * the last entry is the innermost (currently dealing) level. A nested Flip 3
 * pauses its parent level (left in place, remaining untouched) and pushes a
 * new level on top; when the new level empties or is cut short, it is popped
 * and its parent resumes dealing its own remaining cards.
 */
export interface FlipThreeLevel {
  readonly targetId: string;
  readonly remaining: number;
}

export type FlipPhase = 'awaiting-round-start' | 'round-in-progress' | 'round-over' | 'game-over';

export interface FlipRoundResult {
  readonly roundNumber: number;
  /** Round score per player id (0 for a busted hand). */
  readonly scores: Readonly<Record<string, number>>;
  readonly flip7PlayerId: string | null;
}

export interface FlipGameState {
  /** Seat order, fixed for the life of the game. */
  readonly players: readonly FlipPlayerState[];
  readonly dealerIndex: number;
  readonly roundNumber: number;
  /** Persistent shoe. Never reshuffled between rounds. */
  readonly shoe: readonly FlipCardInstance[];
  readonly discard: readonly FlipCardInstance[];
  readonly phase: FlipPhase;
  /**
   * Whose decision it currently is. During the opening deal this tracks the
   * player currently receiving (and, if needed, resolving) their one
   * face-up card; during live play it is fixed to the player whose Hit or
   * Freeze choice is being resolved, including through any Freeze/Flip 3
   * chain it triggers. Null once the round is over.
   */
  readonly turnPlayerId: string | null;
  readonly pendingAction: FlipPendingAction | null;
  readonly flip3Stack: readonly FlipThreeLevel[];
  /** Player ids still owed their opening card, in deal order (dealer last). Null once the opening deal is complete. */
  readonly dealQueue: readonly string[] | null;
  readonly lastRoundResult: FlipRoundResult | null;
  readonly winnerId: string | null;
}

export interface StartFlipGameOptions {
  readonly players: readonly FlipPlayer[];
  readonly random?: () => number;
}
