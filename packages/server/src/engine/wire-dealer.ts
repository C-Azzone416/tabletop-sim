import { randomInt } from 'node:crypto';
import { MISSION_CONFIGS, WIRE_MASTER_SET, getGameById } from '@tabletop/shared';
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

  // Security fix (weasel, PR #227 review): `dealtNumbers` is always the
  // PREFIX of `drawnNumbers` (the first `count` of the shuffled draw) —
  // returning `candidates` in that same order would let array position
  // leak which values are actually dealt vs. decoy (first `count` = real,
  // rest = discard) the instant a mission uses a genuine N-of-M split.
  // Shuffling `candidates` independently, AFTER `dealt` is already fixed,
  // severs that positional correlation — this is the fix itself, not a
  // read-order workaround (a missing/present ORDER BY on the read side
  // must not be what the secrecy guarantee depends on).
  const candidateValues = shuffle(drawnNumbers.map(toValue));

  return {
    dealt: dealtNumbers.map(toValue),
    candidates: candidateValues,
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
export interface BuildDeckResult {
  deck: { value: string; color: WireColor }[];
  /**
   * #215 groundwork — the full M-value candidate pool for any group with a
   * genuine partial-knowledge draw (candidatePoolSize > count). Empty for
   * every group without one (the normal case today — candidates equal
   * dealt by construction, nothing extra to advertise).
   */
  candidates: { value: string; color: WireColor }[];
}

export function buildDeck(config: MissionConfig, capacity: number): BuildDeckResult {
  const deck: { value: string; color: WireColor }[] = [];
  const candidates: { value: string; color: WireColor }[] = [];

  let guaranteedCount = 0;
  for (const group of config.wireGroups) {
    if (group.color === 'blue') continue;
    const { dealt, candidates: groupCandidates } = drawColorGroup(group.color, group);
    for (const value of dealt) deck.push({ value, color: group.color });
    if (groupCandidates.length > dealt.length) {
      for (const value of groupCandidates) candidates.push({ value, color: group.color });
    }
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
  return { deck, candidates };
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
 * #435 — the tray model, replacing eight per-mission wiresPerPlayer tables
 * with one derivation. Caroline's rule (2026-09-13): "there is a 5th tray,
 * divided as closely to even as possible; no split trays; totalWires
 * changes based on mission, not number of players."
 *
 *   trays   = max(4, playerCount)
 *   sizes   = totalWires split across those trays, as evenly as possible,
 *             larger trays first
 *   dealing = whole trays handed to players, as evenly as possible,
 *             captain first
 *
 * Trays are atomic — no player ever holds a partial one — so the
 * unevenness has to live somewhere: in the DEALING at 2-4 players (four
 * equal trays, since totalWires % 4 === 0 for every mission; the captain
 * absorbs an extra whole tray when 4 doesn't divide evenly by playerCount),
 * or in the TRAY SIZES at 5 (one tray each, but the trays differ). The
 * captain (index 0, always dealt first) absorbs the excess at both levels.
 *
 * Reproduces all 24 stored 2p/3p/4p configs exactly — see
 * wire-dealer.test.ts's property test.
 */
export function computeTraySizes(totalWires: number, trayCount: number): number[] {
  const base = Math.floor(totalWires / trayCount);
  const remainder = totalWires % trayCount;
  // The first `remainder` trays get one extra wire each — already
  // descending, since every "+1" tray sorts before every plain one.
  return Array.from({ length: trayCount }, (_, i) => (i < remainder ? base + 1 : base));
}

/**
 * Per-player wire counts, index 0 = captain. See computeTraySizes' doc
 * comment above for the model this implements.
 */
export function computeWireCounts(totalWires: number, playerCount: number): number[] {
  const trayCount = Math.max(4, playerCount);
  const traySizes = computeTraySizes(totalWires, trayCount);

  const traysPerPlayerBase = Math.floor(trayCount / playerCount);
  const traysPerPlayerRemainder = trayCount % playerCount;

  const counts: number[] = [];
  let trayIndex = 0;
  for (let p = 0; p < playerCount; p++) {
    // The captain (p === 0) is dealt first and so is first in line for the
    // remainder tray whenever trayCount doesn't divide evenly by
    // playerCount — this is what makes the captain absorb the extra tray
    // at 3 players and the largest tray at 5.
    const traysThisPlayer = traysPerPlayerBase + (p < traysPerPlayerRemainder ? 1 : 0);
    let sum = 0;
    for (let t = 0; t < traysThisPlayer; t++) sum += traySizes[trayIndex++];
    counts.push(sum);
  }
  return counts;
}

/**
 * Deal wires to players for the given mission, using the tray model above
 * to derive per-player counts from `totalWires` and player count — no
 * per-mission table.
 *
 * Rack order is a single ascending numeric sequence across ALL colors (#190
 * Phase A) — NOT grouped by color. Yellow's .1 and red's .5 suffixes are
 * sort-position only (e.g. 3.5, 4.1, 2, 3, 4, 6 racks as 2, 3, 3.5, 4, 4.1,
 * 6); comparing `Number(value)` is exact because every value in a rack is
 * distinct — no int coercion collapses "4" and "4.1" together.
 */
export interface DealWiresResult {
  wires: DealedWire[];
  /** #215 groundwork — see BuildDeckResult. Empty for every mission today. */
  candidates: { value: string; color: WireColor }[];
}

export function dealWires(playerIds: string[], captainId: string, missionNumber: number = 1): DealWiresResult {
  const playerCount = playerIds.length;
  // #435 — bound to the registry's own ceiling rather than a hardcoded
  // number, so raising Wire Game's maxPlayers is the only place that needs
  // to change; this can't silently drift out of sync with it.
  const maxPlayers = getGameById('wire-game')!.maxPlayers;
  if (playerCount < 1 || playerCount > maxPlayers) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 1-${maxPlayers}.`);
  }

  const config = MISSION_CONFIGS[missionNumber];
  if (!config) {
    throw new Error(`Unknown mission: ${missionNumber}. Must be 1-8.`);
  }
  // #435 — a structural invariant the tray model depends on: 2-4 players
  // always get four EQUAL trays (only the dealing is uneven), which only
  // holds if every mission's deck divides evenly by four. Asserted here
  // rather than left implicit, so a future mission config that violates it
  // fails loudly instead of silently mis-dealing.
  if (config.totalWires % 4 !== 0) {
    throw new Error(
      `Mission ${missionNumber}'s totalWires (${config.totalWires}) is not divisible by 4 — the tray model requires four equal trays at 2-4 players`
    );
  }

  // Determine wire counts per player from the tray model (computed before
  // the deck so #220's guarantee can size the deck to exactly this total).
  // Captain is dealt first (counts[0]) so they receive the tray-model's
  // remainder tray/largest tray, per computeWireCounts' doc comment.
  const wireCounts = new Map<string, number>();
  const others = playerIds.filter(pid => pid !== captainId);
  const counts = computeWireCounts(config.totalWires, playerCount);
  wireCounts.set(captainId, counts[0]);
  others.forEach((pid, i) => wireCounts.set(pid, counts[i + 1]));

  const capacity = [...wireCounts.values()].reduce((sum, n) => sum + n, 0);
  const { deck: builtDeck, candidates } = buildDeck(config, capacity);
  const deck = shuffle(builtDeck);
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

  return { wires: result, candidates };
}
