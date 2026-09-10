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

/** What resolving one drawn card did — the vocabulary a UI narrates a Flip 3/Hit resolution with. */
export type FlipCardEffect =
  | 'number-added'
  | 'number-busted'
  | 'number-saved'
  | 'number-flip7'
  | 'modifier-added'
  | 'second-chance-gained'
  | 'second-chance-discarded'
  | 'freeze-drawn'
  | 'flip3-drawn';

/**
 * One step of what a single public mutator call (hit/freeze/
 * chooseFreezeTarget/chooseFlip3Target/startRound) did, in order. A UI can
 * render this to explain a Flip 3's outcome — why it stopped early (the
 * last event's `effect`, e.g. 'number-busted' or 'freeze-drawn'), that a
 * Second Chance save let it continue ('number-saved' followed by more
 * events), or that a nested Flip 3 fully resolved before the outer one
 * continued (a `context: 'flip3'` run for one targetId, then more events
 * for a different targetId at the same or an outer level).
 */
export interface FlipResolutionEvent {
  readonly targetId: string;
  readonly card: FlipCardInstance;
  readonly effect: FlipCardEffect;
  /** 'deal' = the opening one-card-each deal, 'hit' = a live turn's own draw, 'flip3' = dealt by a Flip 3 (nested or not). */
  readonly context: 'deal' | 'hit' | 'flip3';
}

/**
 * How a round score was arrived at. Lives here rather than in scoring.ts
 * because FlipRoundResult references it (#396) and scoring.ts imports this
 * module; scoring.ts re-exports the name for existing importers.
 */
export interface FlipScoreBreakdown {
  readonly numbersSum: number;
  readonly plusSum: number;
  readonly hasX2: boolean;
  /** 15 or 0. Added after the multiplier, never doubled. */
  readonly flip7Bonus: number;
  /** Identical to `scoreHand` for the same arguments — the number of record. */
  readonly total: number;
  /** True ⇒ every other field is 0: a busted hand scores nothing it held. */
  readonly busted: boolean;
}

export interface FlipRoundResult {
  readonly roundNumber: number;
  /** Round score per player id (0 for a busted hand). */
  readonly scores: Readonly<Record<string, number>>;
  readonly flip7PlayerId: string | null;
  /**
   * #396 — how each score was arrived at, per player id.
   *
   * Captured here because `finalizeRound` clears every hand as it scores:
   * once the round is over the cards that produced these numbers are in the
   * discard with no owner, so the components cannot be recovered afterwards.
   * The scoreboard needs them to show a Flip 7's +15 and a `x2` as distinct
   * terms rather than folded into a total (#365), and deriving them outside
   * the engine would be reimplementing the scoring rule.
   */
  readonly breakdowns: Readonly<Record<string, FlipScoreBreakdown>>;
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
  /**
   * What the most recent public mutator call did, in order. Reset to [] at
   * the start of every call to startRound/hit/freeze/chooseFreezeTarget/
   * chooseFlip3Target — it is a trace of that one call, not a full game
   * history.
   */
  readonly resolutionLog: readonly FlipResolutionEvent[];
}

export interface StartFlipGameOptions {
  readonly players: readonly FlipPlayer[];
  readonly random?: () => number;
}
