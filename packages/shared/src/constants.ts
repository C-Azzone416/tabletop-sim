import type { WireColor } from './types';

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

// ─── Multi-color mission config (Missions 2-8) ───────────────────────────────

export interface WireGroup {
  color: WireColor;
  values: readonly number[];
  copiesPerValue: number;
}

export interface MissionConfig {
  wireGroups: readonly WireGroup[];
  totalWires: number;
  /** Detonator threshold (mistakes before explosion) keyed by player count */
  detonator: Readonly<Record<number, number>>;
  wiresPerPlayer: {
    2: number;
    3: { captain: number; others: number };
    4: number;
  };
}

// Mission 2: Same 24 blue wires as M1, tighter detonator (learn efficiency)
export const MISSION_2_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4, 5, 6], copiesPerValue: 4 },
  ],
  totalWires: 24,
  detonator: { 2: 3, 3: 4, 4: 5 },
  wiresPerPlayer: { 2: 12, 3: { captain: 12, others: 6 }, 4: 6 },
};

// Mission 3: 28 wires — yellow wires introduced (more blue, fewer yellow)
// 16 blue (values 1-4 × 4) + 12 yellow (values 1-3 × 4)
export const MISSION_3_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4], copiesPerValue: 4 },
    { color: 'yellow', values: [1, 2, 3], copiesPerValue: 4 },
  ],
  totalWires: 28,
  detonator: { 2: 4, 3: 5, 4: 6 },
  wiresPerPlayer: { 2: 14, 3: { captain: 14, others: 7 }, 4: 7 },
};

// Mission 4: 28 wires — more yellow, fewer blue (harder deduction)
// 12 blue (values 1-3 × 4) + 16 yellow (values 1-4 × 4)
export const MISSION_4_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3], copiesPerValue: 4 },
    { color: 'yellow', values: [1, 2, 3, 4], copiesPerValue: 4 },
  ],
  totalWires: 28,
  detonator: { 2: 3, 3: 4, 4: 5 },
  wiresPerPlayer: { 2: 14, 3: { captain: 14, others: 7 }, 4: 7 },
};

// Mission 5: 32 wires — red wires introduced, reveal_reds action unlocked
// 16 blue (1-4 × 4) + 12 yellow (1-3 × 4) + 4 red (value 1 × 4)
export const MISSION_5_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4], copiesPerValue: 4 },
    { color: 'yellow', values: [1, 2, 3], copiesPerValue: 4 },
    { color: 'red', values: [1], copiesPerValue: 4 },
  ],
  totalWires: 32,
  detonator: { 2: 4, 3: 5, 4: 6 },
  wiresPerPlayer: { 2: 16, 3: { captain: 16, others: 8 }, 4: 8 },
};

// Mission 6: 32 wires — more reds, tighter detonator
// 12 blue (1-3 × 4) + 12 yellow (1-3 × 4) + 8 red (values 1-2 × 4)
export const MISSION_6_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3], copiesPerValue: 4 },
    { color: 'yellow', values: [1, 2, 3], copiesPerValue: 4 },
    { color: 'red', values: [1, 2], copiesPerValue: 4 },
  ],
  totalWires: 32,
  detonator: { 2: 3, 3: 4, 4: 5 },
  wiresPerPlayer: { 2: 16, 3: { captain: 16, others: 8 }, 4: 8 },
};

// Mission 7: 36 wires — heavy mix, all mechanics, moderate detonator
// 16 blue (1-4 × 4) + 12 yellow (1-3 × 4) + 8 red (values 1-2 × 4)
export const MISSION_7_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4], copiesPerValue: 4 },
    { color: 'yellow', values: [1, 2, 3], copiesPerValue: 4 },
    { color: 'red', values: [1, 2], copiesPerValue: 4 },
  ],
  totalWires: 36,
  detonator: { 2: 4, 3: 5, 4: 6 },
  wiresPerPlayer: { 2: 18, 3: { captain: 18, others: 9 }, 4: 9 },
};

// Mission 8: 36 wires — same distribution as M7, hardest detonator (final training)
export const MISSION_8_CONFIG: MissionConfig = {
  wireGroups: [
    { color: 'blue', values: [1, 2, 3, 4], copiesPerValue: 4 },
    { color: 'yellow', values: [1, 2, 3], copiesPerValue: 4 },
    { color: 'red', values: [1, 2], copiesPerValue: 4 },
  ],
  totalWires: 36,
  detonator: { 2: 3, 3: 3, 4: 4 },
  wiresPerPlayer: { 2: 18, 3: { captain: 18, others: 9 }, 4: 9 },
};

// Lookup map: mission number → config (all missions 1-8)
export const MISSION_CONFIGS: Record<number, MissionConfig> = {
  1: {
    wireGroups: [
      { color: 'blue', values: [1, 2, 3, 4, 5, 6], copiesPerValue: 4 },
    ],
    totalWires: 24,
    detonator: { 2: 4, 3: 5, 4: 6 },
    wiresPerPlayer: { 2: 12, 3: { captain: 12, others: 6 }, 4: 6 },
  },
  2: MISSION_2_CONFIG,
  3: MISSION_3_CONFIG,
  4: MISSION_4_CONFIG,
  5: MISSION_5_CONFIG,
  6: MISSION_6_CONFIG,
  7: MISSION_7_CONFIG,
  8: MISSION_8_CONFIG,
};
