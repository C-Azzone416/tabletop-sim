import { MISSION_1_CONFIG } from '@tabletop/shared';
import type { WireColor } from '@tabletop/shared';

export interface DealedWire {
  playerId: string;
  value: string;
  color: WireColor;
  rackPosition: number;
}

/**
 * Build the wire deck for Mission 1: 24 blue wires, values 1-6, 4 of each.
 */
function buildDeck(): { value: string; color: WireColor }[] {
  const deck: { value: string; color: WireColor }[] = [];
  for (const v of MISSION_1_CONFIG.values) {
    for (let i = 0; i < MISSION_1_CONFIG.copiesPerValue; i++) {
      deck.push({ value: String(v), color: MISSION_1_CONFIG.wireColor });
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle (in-place).
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deal wires to players for Mission 1.
 *
 * Distribution by player count:
 * - 2 players: 12 each
 * - 3 players: captain gets 12, others get 6
 * - 4 players: 6 each
 *
 * Wires are sorted by value within each player's rack and assigned positions.
 */
export function dealWires(playerIds: string[], captainId: string): DealedWire[] {
  const playerCount = playerIds.length;
  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 2-4.`);
  }

  const deck = shuffle(buildDeck());
  const playerWires: Map<string, { value: string; color: WireColor }[]> = new Map();

  for (const pid of playerIds) {
    playerWires.set(pid, []);
  }

  // Determine wire counts per player
  const wireCounts = new Map<string, number>();
  if (playerCount === 2) {
    for (const pid of playerIds) wireCounts.set(pid, 12);
  } else if (playerCount === 3) {
    for (const pid of playerIds) {
      wireCounts.set(pid, pid === captainId ? 12 : 6);
    }
  } else {
    for (const pid of playerIds) wireCounts.set(pid, 6);
  }

  // Deal from the shuffled deck
  let deckIndex = 0;
  for (const pid of playerIds) {
    const count = wireCounts.get(pid)!;
    const hand = playerWires.get(pid)!;
    for (let i = 0; i < count; i++) {
      hand.push(deck[deckIndex++]);
    }
  }

  // Sort each player's wires by value and assign rack positions
  const result: DealedWire[] = [];
  for (const pid of playerIds) {
    const hand = playerWires.get(pid)!;
    hand.sort((a, b) => Number(a.value) - Number(b.value));
    hand.forEach((wire, index) => {
      result.push({
        playerId: pid,
        value: wire.value,
        color: wire.color,
        rackPosition: index + 1,
      });
    });
  }

  return result;
}
