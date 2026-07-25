import { randomInt } from 'node:crypto';
import { MISSION_CONFIGS, WIRE_MASTER_SET } from '@tabletop/shared';
import type { MissionConfig, WireColor } from '@tabletop/shared';

export interface DealedWire {
  playerId: string;
  value: string;
  color: WireColor;
  rackPosition: number;
}

interface ColorWireGroupInput {
  count: number;
  candidatePoolSize?: number;
}

/**
 * Result of drawing a yellow/red color group: `dealt` are the values that
 * actually go into the deck; `candidates` is the full revealed pool (a
 * superset of `dealt` when the group specifies a partial-knowledge N-out-of-M
 * draw — see WireGroup.candidatePoolSize). Setup marks every candidate on
 * the board as *possible* even though only `dealt` is secretly in play.
 */
export interface ColorGroupDraw {
  dealt: string[];
  candidates: string[];
}

/**
 * Draw a yellow/red wire group per WireGroup's count/candidatePoolSize.
 * Values are singletons (WIRE_MASTER_SET max 11) with a decimal suffix that
 * exists only to place the tile in the rack sort — never a gameplay value.
 *
 * Exported standalone (not just used internally by buildDeck) so the
 * partial-knowledge "N out of M" draw shape can be unit-tested directly,
 * independent of a full mission deal.
 */
export function drawColorGroup(color: 'yellow' | 'red', group: ColorWireGroupInput): ColorGroupDraw {
  const { count, candidatePoolSize = count } = group;
  const { min, max, decimalSuffix } = WIRE_MASTER_SET[color];
  const poolLimit = max - min + 1;

  if (candidatePoolSize < count) {
    throw new Error(`${color} candidatePoolSize (${candidatePoolSize}) must be >= count (${count})`);
  }
  if (candidatePoolSize > poolLimit) {
    throw new Error(`${color} candidatePoolSize (${candidatePoolSize}) exceeds the master set (${poolLimit} singletons)`);
  }

  // Draw `candidatePoolSize` distinct numbers out of the master range, then
  // secretly select `count` of them as the real deal — the remainder stays
  // a revealed-but-unused candidate, exactly mirroring the physical setup:
  // reveal M, deal N, set the rest aside unseen.
  const pool: number[] = [];
  for (let n = min; n <= max; n++) pool.push(n);
  shuffle(pool);
  const drawnNumbers = pool.slice(0, candidatePoolSize);
  const dealtNumbers = drawnNumbers.slice(0, count);

  const toValue = (n: number) => `${n}${decimalSuffix}`;
  return {
    dealt: dealtNumbers.map(toValue),
    candidates: drawnNumbers.map(toValue),
  };
}

/**
 * Build the full wire deck for a mission, sized to EXACTLY `capacity`
 * (total stand slots across all players this deal).
 *
 * #220 — the dealer contract: a mission's yellow/red counts are a
 * guarantee, not a maximum draw from a larger pool. Every configured
 * yellow/red tile enters play; blue is the pool that fills whatever
 * capacity is left over. This is NOT symmetric with blue on purpose —
 * blue's `values`/`copiesPerValue` describe a draw POOL (sampled down to
 * fit), while a color group's `count` describes a DEAL GUARANTEE (dealt in
 * full, always). Building the deck at exactly `capacity` means the
 * existing per-player dealing loop deals the whole deck with nothing left
 * over — the previous bug was a shuffled deck sized larger than capacity
 * (the full 48-tile blue pool), so leftover cards — including, by chance,
 * the single yellow/red tile — never got dealt at all.
 */
export function buildDeck(config: MissionConfig, capacity: number): { value: string; color: WireColor }[] {
  const deck: { value: string; color: WireColor }[] = [];

  let guaranteedCount = 0;
  for (const group of config.wireGroups) {
    if (group.color === 'blue') continue;
    const { dealt } = drawColorGroup(group.color, group);
    for (const value of dealt) deck.push({ value, color: group.color });
    guaranteedCount += dealt.length;
  }

  const blueNeeded = capacity - guaranteedCount;
  if (blueNeeded < 0) {
    throw new Error(
      `Mission wireGroups guarantee ${guaranteedCount} non-blue wires but only ${capacity} stand slots are configured`
    );
  }

  const bluePool: { value: string; color: WireColor }[] = [];
  for (const group of config.wireGroups) {
    if (group.color !== 'blue') continue;
    for (const v of group.values) {
      for (let i = 0; i < group.copiesPerValue; i++) {
        bluePool.push({ value: String(v), color: 'blue' });
      }
    }
  }
  if (blueNeeded > bluePool.length) {
    throw new Error(
      `Mission needs ${blueNeeded} blue wires to fill remaining capacity but the blue pool only has ${bluePool.length}`
    );
  }

  deck.push(...shuffle(bluePool).slice(0, blueNeeded));
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
 * Rack order is a single ascending numeric sequence across ALL colors (#190
 * Phase A) — NOT grouped by color. Yellow's .1 and red's .5 suffixes are
 * sort-position only (e.g. 3.5, 4.1, 2, 3, 4, 6 racks as 2, 3, 3.5, 4, 4.1,
 * 6); comparing `Number(value)` is exact because every value in a rack is
 * distinct — no int coercion collapses "4" and "4.1" together.
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

  // Determine wire counts per player from mission config (computed before
  // the deck so #220's guarantee can size the deck to exactly this total).
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

  const capacity = [...wireCounts.values()].reduce((sum, n) => sum + n, 0);
  const deck = shuffle(buildDeck(config, capacity));
  const playerWires: Map<string, { value: string; color: WireColor }[]> = new Map();

  for (const pid of playerIds) {
    playerWires.set(pid, []);
  }

  // Deal from the shuffled deck — sized to exactly `capacity` (#220), so
  // this exhausts the whole deck with nothing left undealt.
  let deckIndex = 0;
  for (const pid of playerIds) {
    const count = wireCounts.get(pid)!;
    const hand = playerWires.get(pid)!;
    for (let i = 0; i < count; i++) {
      hand.push(deck[deckIndex++]);
    }
  }

  // Single ascending numeric sort per player rack — no color grouping.
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
