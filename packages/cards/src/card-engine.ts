export const STANDARD_SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export const STANDARD_RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace',
] as const;

export type StandardSuit = (typeof STANDARD_SUITS)[number];
export type StandardRank = (typeof STANDARD_RANKS)[number];

export interface StandardCardDefinition {
  readonly suit: StandardSuit;
  readonly rank: StandardRank;
}

export interface CardInstance extends StandardCardDefinition {
  /**
   * Unique within one generated shoe. Game sessions may prefix this value
   * when they need globally unique persisted identifiers.
   */
  readonly id: string;
  /** Zero-based index of the physical deck copy within the shoe. */
  readonly deckIndex: number;
}

export interface CreateShoeOptions {
  /** Number of complete, unchanged 52-card decks to include. */
  readonly decks?: number;
  /** Prefix used when generating card instance IDs. */
  readonly idPrefix?: string;
}

const freezeCard = (
  suit: StandardSuit,
  rank: StandardRank,
): Readonly<StandardCardDefinition> => Object.freeze({ suit, rank });

/**
 * Canonical contents of one standard 52-card deck.
 *
 * Game rules must never mutate this definition. Jokers, wild cards, point
 * values, trump rules, and suit ordering belong to individual games.
 */
export const STANDARD_52_CARD_DECK: readonly Readonly<StandardCardDefinition>[] =
  Object.freeze(
    STANDARD_SUITS.flatMap((suit) =>
      STANDARD_RANKS.map((rank) => freezeCard(suit, rank)),
    ),
  );

export function createStandardShoe(
  options: CreateShoeOptions = {},
): CardInstance[] {
  const decks = options.decks ?? 1;
  const idPrefix = options.idPrefix ?? 'card';

  if (!Number.isInteger(decks) || decks < 1) {
    throw new RangeError('decks must be a positive integer');
  }

  return Array.from({ length: decks }, (_, deckIndex) =>
    STANDARD_52_CARD_DECK.map((card) => ({
      ...card,
      deckIndex,
      id: `${idPrefix}:${deckIndex}:${card.suit}:${card.rank}`,
    })),
  ).flat();
}

/** Fisher-Yates shuffle. Inject a seeded random function for replayable tests. */
export function shuffleCards<T>(
  cards: readonly T[],
  random: () => number = Math.random,
): T[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export interface DealResult<T> {
  readonly hands: T[][];
  readonly remainder: T[];
}

/**
 * Deals one card at a time, beginning with hand 0, without mutating the input.
 */
export function dealCards<T>(
  cards: readonly T[],
  handCount: number,
  cardsPerHand: number,
): DealResult<T> {
  if (!Number.isInteger(handCount) || handCount < 1) {
    throw new RangeError('handCount must be a positive integer');
  }
  if (!Number.isInteger(cardsPerHand) || cardsPerHand < 0) {
    throw new RangeError('cardsPerHand must be a non-negative integer');
  }

  const requested = handCount * cardsPerHand;
  if (requested > cards.length) {
    throw new RangeError('not enough cards to complete the requested deal');
  }

  const hands = Array.from({ length: handCount }, () => [] as T[]);
  for (let index = 0; index < requested; index += 1) {
    hands[index % handCount].push(cards[index]);
  }

  return {
    hands,
    remainder: cards.slice(requested),
  };
}
