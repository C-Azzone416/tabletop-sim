import type {
  Game,
  Player,
  Wire,
  InfoToken,
  ValidationToken,
  Turn,
} from "@tabletop/shared";

let idCounter = 0;
function nextId() {
  return `test-${++idCounter}`;
}

export function resetIds() {
  idCounter = 0;
}

export function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: nextId(),
    mission: 1,
    status: "waiting",
    captainId: null,
    currentTurnPlayerId: null,
    joinCode: "ABC123",
    detonatorPosition: 0,
    detonatorMax: 4,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: nextId(),
    gameId: "game-1",
    name: `Player ${idCounter}`,
    seatOrder: 0,
    doubleDetectorUsed: false,
    joinedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeWire(overrides: Partial<Wire> = {}): Wire {
  return {
    id: nextId(),
    gameId: "game-1",
    playerId: "player-1",
    value: "3",
    color: "blue",
    rackPosition: 0,
    status: "hidden",
    ...overrides,
  };
}

export function makeInfoToken(overrides: Partial<InfoToken> = {}): InfoToken {
  return {
    id: nextId(),
    gameId: "game-1",
    wireId: "wire-1",
    value: "3",
    placedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeValidationToken(
  overrides: Partial<ValidationToken> = {}
): ValidationToken {
  return {
    id: nextId(),
    gameId: "game-1",
    wireValue: "3",
    validatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: nextId(),
    gameId: "game-1",
    playerId: "player-1",
    actionType: "duo_cut",
    targetWireId: null,
    targetWireId2: null,
    guessedValue: null,
    result: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
