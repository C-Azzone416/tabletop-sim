import { shuffleCards } from '@tabletop/shared';
import { buildFlipDeck, FLIP_DECK_SIZE } from './deck';
import { nextActiveSeatIndex } from './rules';
import type {
  FlipCardDefinition,
  FlipCardInstance,
  FlipGameState,
  FlipPendingAction,
  FlipPhase,
  FlipPlayer,
  FlipPlayerState,
  FlipPlayerStatus,
  FlipRoundResult,
  FlipThreeLevel,
} from './types';

export interface FlipStateSpec {
  readonly players: readonly FlipPlayer[];
  /** Exact draw order, index 0 drawn first. Defaults to the canonical deck's cards not already placed in hands/discard, shuffled. */
  readonly shoe?: readonly FlipCardInstance[];
  readonly hands?: Readonly<Record<string, readonly FlipCardInstance[]>>;
  readonly statuses?: Readonly<Record<string, FlipPlayerStatus>>;
  readonly totalScores?: Readonly<Record<string, number>>;
  readonly discard?: readonly FlipCardInstance[];
  readonly dealerIndex?: number;
  readonly roundNumber?: number;
  readonly phase?: FlipPhase;
  /** Defaults to the first active seat after the dealer, when the round is live and no deal is in flight. */
  readonly turnPlayerId?: string;
  readonly pendingAction?: FlipPendingAction | null;
  readonly flip3Stack?: readonly FlipThreeLevel[];
  readonly dealQueue?: readonly string[] | null;
  readonly lastRoundResult?: FlipRoundResult | null;
  readonly winnerId?: string | null;
  /** Only consulted when `shoe` is omitted, to shuffle the leftover canonical cards. */
  readonly random?: () => number;
}

function cardSignature(card: FlipCardDefinition): string {
  if (card.kind === 'number') return `number:${card.value}`;
  if (card.kind === 'modifier') return `modifier:${card.modifier}`;
  return `action:${card.action}`;
}

function countSignatures(cards: readonly FlipCardDefinition[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(cardSignature(card), (counts.get(cardSignature(card)) ?? 0) + 1);
  return counts;
}

const CANONICAL_SIGNATURE_COUNTS = countSignatures(buildFlipDeck());

/** The canonical deck's instances minus one match per card in `placed`, by definition (not id). */
function remainingCanonicalPool(placed: readonly FlipCardDefinition[]): FlipCardInstance[] {
  const remaining = buildFlipDeck();
  for (const card of placed) {
    const index = remaining.findIndex((candidate) => cardSignature(candidate) === cardSignature(card));
    if (index === -1) {
      throw new Error(`too many "${cardSignature(card)}" cards placed — the canonical deck only has so many`);
    }
    remaining.splice(index, 1);
  }
  return remaining;
}

function handHasImpossibleDuplicateNumber(hand: readonly FlipCardInstance[]): boolean {
  const seen = new Set<number>();
  for (const card of hand) {
    if (card.kind !== 'number') continue;
    if (seen.has(card.value)) return true;
    seen.add(card.value);
  }
  return false;
}

/**
 * Builds a FlipGameState directly at an arbitrary point in a round or game,
 * validating the invariants normal play guarantees by construction (deck
 * conservation, no impossible hands, references resolve to real seats).
 * For seeding a specific table state — /dev tooling, stacked-deck test
 * scenarios — never for normal play, which goes through startFlipGame/
 * startRound/hit/freeze/chooseFreezeTarget/chooseFlip3Target instead.
 */
export function buildFlipGameState(spec: FlipStateSpec): FlipGameState {
  if (spec.players.length < 2 || spec.players.length > 5) {
    throw new RangeError('Flip requires between two and five players');
  }
  const knownIds = new Set(spec.players.map((player) => player.id));
  if (knownIds.size !== spec.players.length) {
    throw new Error('player ids must be unique');
  }

  const dealerIndex = spec.dealerIndex ?? 0;
  if (!Number.isInteger(dealerIndex) || dealerIndex < 0 || dealerIndex >= spec.players.length) {
    throw new RangeError('dealerIndex out of range');
  }

  const hands = spec.hands ?? {};
  const statuses = spec.statuses ?? {};
  const totalScores = spec.totalScores ?? {};
  const players: FlipPlayerState[] = spec.players.map((player) => ({
    id: player.id,
    name: player.name,
    status: statuses[player.id] ?? 'active',
    hand: hands[player.id] ?? [],
    totalScore: totalScores[player.id] ?? 0,
  }));

  const phase = spec.phase ?? 'round-in-progress';
  const roundNumber = spec.roundNumber ?? 1;
  const discard = spec.discard ?? [];
  const dealQueue = spec.dealQueue ?? null;
  const pendingAction = spec.pendingAction ?? null;
  const flip3Stack = spec.flip3Stack ?? [];

  const requireKnownPlayer = (id: string, context: string): void => {
    if (!knownIds.has(id)) throw new Error(`${context} references unknown player: ${id}`);
  };
  for (const level of flip3Stack) requireKnownPlayer(level.targetId, 'flip3Stack entry');
  if (dealQueue) for (const id of dealQueue) requireKnownPlayer(id, 'dealQueue entry');

  let turnPlayerId: string | null;
  if (spec.turnPlayerId !== undefined) {
    requireKnownPlayer(spec.turnPlayerId, 'turnPlayerId');
    turnPlayerId = spec.turnPlayerId;
  } else if (phase === 'round-in-progress' && dealQueue === null) {
    const opener = nextActiveSeatIndex(players, dealerIndex);
    turnPlayerId = opener === null ? null : players[opener]!.id;
  } else {
    turnPlayerId = null;
  }

  if (pendingAction && phase !== 'round-in-progress') {
    throw new Error('pendingAction can only be set while a round is in progress');
  }
  if (pendingAction && turnPlayerId === null) {
    throw new Error('pendingAction requires a turnPlayerId');
  }
  if (flip3Stack.length > 0 && phase !== 'round-in-progress') {
    throw new Error('flip3Stack can only be non-empty while a round is in progress');
  }

  for (const player of players) {
    if (handHasImpossibleDuplicateNumber(player.hand)) {
      throw new Error(`player ${player.id} holds a duplicate number card — an impossible hand`);
    }
    const secondChanceCount = player.hand.filter(
      (card) => card.kind === 'action' && card.action === 'second-chance',
    ).length;
    if (secondChanceCount > 1) {
      throw new Error(`player ${player.id} holds more than one Second Chance — an impossible hand`);
    }
  }

  const placedCards = [...discard, ...players.flatMap((player) => player.hand)];
  const shoe = spec.shoe ?? shuffleCards(remainingCanonicalPool(placedCards), spec.random ?? Math.random);

  const allCards = [...shoe, ...placedCards];
  if (new Set(allCards.map((card) => card.id)).size !== allCards.length) {
    throw new Error('duplicate card instance ids across shoe/discard/hands');
  }
  if (allCards.length !== FLIP_DECK_SIZE) {
    throw new Error(`card set has ${allCards.length} cards; the Flip deck must total ${FLIP_DECK_SIZE}`);
  }
  const actualCounts = countSignatures(allCards);
  for (const [signature, expected] of CANONICAL_SIGNATURE_COUNTS) {
    if ((actualCounts.get(signature) ?? 0) !== expected) {
      throw new Error(`card set does not match the canonical Flip deck (mismatch on ${signature})`);
    }
  }

  return {
    players,
    dealerIndex,
    roundNumber,
    shoe,
    discard,
    phase,
    turnPlayerId,
    pendingAction,
    flip3Stack,
    dealQueue,
    lastRoundResult: spec.lastRoundResult ?? null,
    winnerId: spec.winnerId ?? null,
  };
}
