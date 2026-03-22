// Detonator thresholds: how many mistakes before explosion, by player count
export const DETONATOR_CONFIG: Record<number, number> = {
  2: 4,
  3: 5,
  4: 6,
};

// Mission 1 wire setup: 24 blue wires, values 1-6, 4 of each
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
