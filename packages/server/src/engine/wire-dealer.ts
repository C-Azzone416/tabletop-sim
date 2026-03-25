import { randomInt } from 'node:crypto';
import { MISSION_CONFIGS } from '@tabletop/shared';
import type { MissionConfig, WireColor } from '@tabletop/shared';

export interface DealedWire {
  playerId: string;
  value: string;
  color: WireColor;
  rackPosition: number;
}

/**
 * Build the full wire deck for a mission from its wire groups.
 */
function buildDeck(config: MissionConfig): { value: string; color: WireColor }[] {
  const deck: { value: string; color: WireColor }[] = [];
  for (const group of config.wireGroups) {
    for (const v of group.values) {
      for (let i = 0; i < group.copiesPerValue; i++) {
        deck.push({ value: String(v), color: group.color });
      }
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle (in-place).
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deal wires to players for the given mission.
 *
 * Wire distribution is driven by the mission config's wiresPerPlayer field:
 * - 2 players: equal split
 * - 3 players: captain gets more, others equal
 * - 4 players: equal split
 *
 * Wires are sorted by color group order (blue → yellow → red) then by value
 * within each color, and assigned rack positions sequentially.
 */
export function dealWires(playerIds: string[], captainId: string, missionNumber: number = 1): DealedWire[] {
  const playerCount = playerIds.length;
  if (playerCount < 1 || playerCount > 4) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 1-4.`);
  }

  const config = MISSION_CONFIGS[missionNumber];
  if (!config) {
    throw new Error(`Unknown mission: ${missionNumber}. Must be 1-8.`);
  }

  const deck = shuffle(buildDeck(config));
  const playerWires: Map<string, { value: string; color: WireColor }[]> = new Map();

  for (const pid of playerIds) {
    playerWires.set(pid, []);
  }

  // Determine wire counts per player from mission config
  const wireCounts = new Map<string, number>();
  const wpp = config.wiresPerPlayer;
  if (playerCount === 2) {
    for (const pid of playerIds) wireCounts.set(pid, wpp[2]);
  } else if (playerCount === 3) {
    const counts = wpp[3] as { captain: number; others: number };
    for (const pid of playerIds) {
      wireCounts.set(pid, pid === captainId ? counts.captain : counts.others);
    }
  } else {
    for (const pid of playerIds) wireCounts.set(pid, wpp[4]);
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

  // Color group order for sorting: blue first, yellow second, red third
  const colorOrder: Record<WireColor, number> = { blue: 0, yellow: 1, red: 2 };

  // Sort each player's wires by color group then by numeric value, assign rack positions
  const result: DealedWire[] = [];
  for (const pid of playerIds) {
    const hand = playerWires.get(pid)!;
    hand.sort((a, b) => {
      const colorDiff = colorOrder[a.color] - colorOrder[b.color];
      if (colorDiff !== 0) return colorDiff;
      return Number(a.value) - Number(b.value);
    });
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
