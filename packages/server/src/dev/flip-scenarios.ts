// #370 — the stacked-deck scenario catalogue for Flip dev seeding (epic #358).
//
// This module is deliberately the *catalogue* only: the names, what each one
// is for, and the validation of a requested name. Building the actual table
// state belongs to the engine (#360) via its state constructor — the server
// must not assemble a FlipGameState itself, or knowledge of engine invariants
// leaks into the transport layer, which #361 says not to do.
//
// Splitting it this way means the /dev UI can list and validate scenarios
// before the engine's constructor exists, and wiring the constructor in later
// touches one file rather than the endpoint.

export const FLIP_SCENARIOS = [
  {
    name: 'flip7-ready',
    summary: 'A player holds 6 unique numbers with the 7th on top of the shoe.',
    exercises: 'Flip 7 detection, the +15 bonus, and immediate round end.',
  },
  {
    name: 'flip3-bust',
    summary: 'Flip 3 on top; the target holds a duplicate of the next card.',
    exercises: 'A bust during Flip 3 stops the remaining cards.',
  },
  {
    name: 'flip3-nested',
    summary: 'A Flip 3 whose dealt cards contain another Flip 3.',
    exercises: 'The nested flip resolves fully, then the outstanding flips continue.',
  },
  {
    name: 'flip3-freeze',
    summary: 'A Freeze is drawn during a Flip 3.',
    exercises: 'Freeze wins — the remaining cards are not dealt.',
  },
  {
    name: 'second-chance-save',
    summary: 'A player holds a Second Chance with a duplicate on top.',
    exercises: 'The save path: both cards discard, the turn ends, no bust.',
  },
  {
    name: 'second-chance-midflip3',
    summary: 'A Second Chance save occurs partway through a Flip 3.',
    exercises: 'The save does NOT end the Flip 3 — the deal continues.',
  },
  {
    name: 'deck-exhaustion',
    summary: 'Three cards left in the shoe, mid-round.',
    exercises: 'The discard reshuffles back in immediately, with no round boundary.',
  },
  {
    name: 'near-200',
    summary: 'Players sitting at 180-199 cumulative.',
    exercises: 'The win check at 200+, and the highest-final-round tie-break.',
  },
] as const;

export type FlipScenarioName = (typeof FLIP_SCENARIOS)[number]['name'];

const SCENARIO_NAMES: readonly string[] = FLIP_SCENARIOS.map((scenario) => scenario.name);

export function isFlipScenarioName(value: unknown): value is FlipScenarioName {
  return typeof value === 'string' && SCENARIO_NAMES.includes(value);
}

export const FLIP_MIN_PLAYERS = 2;
export const FLIP_MAX_PLAYERS = 5;
