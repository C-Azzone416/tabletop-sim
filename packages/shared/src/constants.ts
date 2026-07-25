// Detonator thresholds: how many mistakes before explosion, by player count
// Used by Mission 1. Missions 2-8 define their own detonator in MissionConfig.
export const DETONATOR_CONFIG: Record<number, number> = {
  2: 4,
  3: 5,
  4: 6,
};

// Mission 1 wire setup: 24 blue wires, values 1-6, 4 of each
// Legacy format — used by wire-dealer until the dealer refactor lands.
export const MISSION_1_CONFIG = {
  wireColor: 'blue' as const,
  values: [1, 2, 3, 4, 5, 6],
  copiesPerValue: 4,
  totalWires: 24,
  // Wires per player by player count
  wiresPerPlayer: {
    2: 12,
    3: { captain: 12, others: 6 },
    4: 6,
  },
} as const;

// ─── Master wire set (#190) ──────────────────────────────────────────────────
//
// Verified against the source game's official rulebook (2026-07-25 research,
// see #190 comments) — this is the ONE place tile identities are defined.
// No mission config may invent tiles outside this set.
//
// Blue is the only duplicated color (48 tiles, 4 copies of 1-12). Yellow and
// red are singletons (11 tiles each, 1-11) — the rulebook states outright
// that their decimal suffix (.1 / .5) exists ONLY to position the tile in
// the single interleaved rack sort; during play they carry no numeric value,
// they are simply "yellow" or "red". Nothing in the engine may read a
// yellow/red wire's decimal as a gameplay quantity — color is the only
// thing that can ever be compared for yellow/red resolution.
export const WIRE_MASTER_SET = {
  blue: { min: 1, max: 12, copiesPerValue: 4 },
  yellow: { min: 1, max: 11, decimalSuffix: '.1' },
  red: { min: 1, max: 11, decimalSuffix: '.5' },
} as const;

// ─── Multi-color mission config (Missions 2-8) ───────────────────────────────

export interface BlueWireGroup {
  color: 'blue';
  values: readonly number[];
  copiesPerValue: number;
}

export interface ColorWireGroup {
  color: 'yellow' | 'red';
  /** How many tiles of this color are actually dealt into play this mission. */
  count: number;
  /**
   * Partial-knowledge "N out of M" draw (rulebook-confirmed — at least one
   * training mission uses it). Setup draws this many CANDIDATE values,
   * reveals all of them on the board as *possible*, then secretly deals
   * only `count` of them into play and sets the rest aside unseen — the
   * board deliberately advertises a superset of the real deal. Omit (or set
   * equal to `count`) for full-knowledge groups.
   */
  candidatePoolSize?: number;
}

export type WireGroup = BlueWireGroup | ColorWireGroup;

export interface MissionConfig {
  wireGroups: readonly WireGroup[];
  totalWires: number;
  /** Detonator threshold (mistakes before explosion) keyed by player count */
  detonator: Readonly<Record<number, number>>;
  wiresPerPlayer: {
    2: number;
    3: { captain: number; others: number };
    4: number;
    /**
     * Physical game supports 5p; v1 scope is 2-4 so no mission defines this
     * yet, but the shape must not preclude it (#190 Phase A AC).
     */
    5?: number;
  };
}

// Mission 1: 24 blue wires, values 1-6, 4 of each.
// TODO(#216): blue set for missions 1-3 is not yet confirmed against the
// physical Mission cards — this is the pre-existing value, kept as-is
// ("stays safe" per the #190 ruling) pending Caroline's data.
const MISSION_1: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4, 5, 6], copiesPerValue: 4 },
  ],
  totalWires: 24,
  detonator: { 2: 4, 3: 5, 4: 6 },
  wiresPerPlayer: { 2: 12, 3: { captain: 12, others: 6 }, 4: 6 },
};

// Mission 2: Same 24 blue wires as M1, tighter detonator (learn efficiency).
// TODO(#216): blue set for missions 1-3 not yet confirmed — placeholder.
export const MISSION_2_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4, 5, 6], copiesPerValue: 4 },
  ],
  totalWires: 24,
  detonator: { 2: 3, 3: 4, 4: 5 },
  wiresPerPlayer: { 2: 12, 3: { captain: 12, others: 6 }, 4: 6 },
};

// Mission 3: yellow wires introduced.
// TODO(#216): blue set for missions 1-3 AND yellow count are not yet
// confirmed — count:1 is a structurally-safe placeholder (yellow's real max
// is 11 singletons total, nowhere near the old invented 12-tile group),
// NOT a guess at the real mission composition. wiresPerPlayer/totalWires
// are sized to this placeholder deck (16 total, same invariant every other
// mission holds: total dealt is constant across 2p/3p/4p, just split
// differently) and will need re-deriving in Phase D.
export const MISSION_3_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4], copiesPerValue: 4 },
    { color: 'yellow', count: 1 },
  ],
  totalWires: 16,
  detonator: { 2: 4, 3: 5, 4: 6 },
  wiresPerPlayer: { 2: 8, 3: { captain: 8, others: 4 }, 4: 4 },
};

// Mission 4: blue set CONFIRMED (rulebook: missions 4-8 use all 48 blue
// wires). Yellow count is TODO(#216) — count:1 placeholder, not a guess.
export const MISSION_4_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], copiesPerValue: 4 },
    { color: 'yellow', count: 1 },
  ],
  totalWires: 28,
  detonator: { 2: 3, 3: 4, 4: 5 },
  wiresPerPlayer: { 2: 14, 3: { captain: 14, others: 7 }, 4: 7 },
};

// Mission 5: blue set CONFIRMED (all 48). Yellow/red counts are TODO(#216).
export const MISSION_5_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], copiesPerValue: 4 },
    { color: 'yellow', count: 1 },
    { color: 'red', count: 1 },
  ],
  totalWires: 32,
  detonator: { 2: 4, 3: 5, 4: 6 },
  wiresPerPlayer: { 2: 16, 3: { captain: 16, others: 8 }, 4: 8 },
};

// Mission 6: blue set CONFIRMED (all 48). Yellow/red counts are TODO(#216).
export const MISSION_6_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], copiesPerValue: 4 },
    { color: 'yellow', count: 1 },
    { color: 'red', count: 1 },
  ],
  totalWires: 32,
  detonator: { 2: 3, 3: 4, 4: 5 },
  wiresPerPlayer: { 2: 16, 3: { captain: 16, others: 8 }, 4: 8 },
};

// Mission 7: blue set CONFIRMED (all 48). Yellow/red counts are TODO(#216).
export const MISSION_7_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], copiesPerValue: 4 },
    { color: 'yellow', count: 1 },
    { color: 'red', count: 1 },
  ],
  totalWires: 36,
  detonator: { 2: 4, 3: 5, 4: 6 },
  wiresPerPlayer: { 2: 18, 3: { captain: 18, others: 9 }, 4: 9 },
};

// Mission 8: blue set CONFIRMED (all 48). Yellow/red counts are TODO(#216).
export const MISSION_8_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], copiesPerValue: 4 },
    { color: 'yellow', count: 1 },
    { color: 'red', count: 1 },
  ],
  totalWires: 36,
  detonator: { 2: 3, 3: 3, 4: 4 },
  wiresPerPlayer: { 2: 18, 3: { captain: 18, others: 9 }, 4: 9 },
};

// Lookup map: mission number → config (all missions 1-8)
export const MISSION_CONFIGS: Record<number, MissionConfig> = {
  1: MISSION_1,
  2: MISSION_2_CONFIG,
  3: MISSION_3_CONFIG,
  4: MISSION_4_CONFIG,
  5: MISSION_5_CONFIG,
  6: MISSION_6_CONFIG,
  7: MISSION_7_CONFIG,
  8: MISSION_8_CONFIG,
};
