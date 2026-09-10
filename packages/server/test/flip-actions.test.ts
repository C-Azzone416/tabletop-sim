import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeGame, makePlayer, resetIds } from "./fixtures.js";

vi.mock("../src/db/flip-games.js", () => ({
  getFlipGameState: vi.fn(),
  saveFlipGameState: vi.fn(),
  recordFlipRoundScores: vi.fn(),
  getFlipRoundScores: vi.fn(),
}));
vi.mock("../src/db/games.js", () => ({
  getGameById: vi.fn(),
}));
vi.mock("../src/db/players.js", () => ({
  getPlayersByGameId: vi.fn(),
}));
vi.mock("../src/ws/state-broadcaster.js", () => ({
  broadcastGameState: vi.fn(),
}));

import * as flipGamesDb from "../src/db/flip-games.js";
import * as gamesDb from "../src/db/games.js";
import * as playersDb from "../src/db/players.js";
import * as stateBroadcaster from "../src/ws/state-broadcaster.js";
import {
  handleFlipStartRound,
  handleFlipHit,
  handleFlipFreeze,
  handleFlipChooseFreezeTarget,
  handleFlipChooseFlip3Target,
} from "../src/ws/flip-actions.js";
import { buildFlipGameState, type FlipGameState } from "@tabletop/game-flip";

const mockFlipGamesDb = vi.mocked(flipGamesDb);
const mockGamesDb = vi.mocked(gamesDb);
const mockPlayersDb = vi.mocked(playersDb);
const mockBroadcaster = vi.mocked(stateBroadcaster);

const GAME_ID = "game-1";

function setStoredState(state: FlipGameState): void {
  mockFlipGamesDb.getFlipGameState.mockResolvedValue(state);
}

describe("flip-actions", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
    mockGamesDb.getGameById.mockResolvedValue(makeGame({ id: GAME_ID, gameType: "flip", status: "active" }));
    mockPlayersDb.getPlayersByGameId.mockResolvedValue([
      makePlayer({ id: "a", gameId: GAME_ID }),
      makePlayer({ id: "b", gameId: GAME_ID }),
    ]);
  });

  it("handleFlipStartRound calls the engine, persists, and broadcasts", async () => {
    const state = buildFlipGameState({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      phase: "awaiting-round-start",
      turnPlayerId: undefined,
      dealerIndex: 0,
    });
    setStoredState(state);

    await handleFlipStartRound(GAME_ID, "a");

    expect(mockFlipGamesDb.saveFlipGameState).toHaveBeenCalledTimes(1);
    const [savedGameId, savedState] = mockFlipGamesDb.saveFlipGameState.mock.calls[0]!;
    expect(savedGameId).toBe(GAME_ID);
    expect((savedState as FlipGameState).phase).toBe("round-in-progress");
    expect(mockBroadcaster.broadcastGameState).toHaveBeenCalledWith(
      GAME_ID,
      expect.objectContaining({ id: GAME_ID }),
      expect.any(Array),
    );
  });

  it("handleFlipStartRound rejects a non-dealer", async () => {
    const state = buildFlipGameState({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      phase: "awaiting-round-start",
      turnPlayerId: undefined,
      dealerIndex: 0,
    });
    setStoredState(state);

    await expect(handleFlipStartRound(GAME_ID, "b")).rejects.toThrow("only the dealer can start the round");
    expect(mockFlipGamesDb.saveFlipGameState).not.toHaveBeenCalled();
  });

  it("handleFlipHit draws a card for the active player and persists the result", async () => {
    const state = buildFlipGameState({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      turnPlayerId: "a",
      hands: { a: [], b: [] },
    });
    setStoredState(state);

    await handleFlipHit(GAME_ID, "a");

    const [, savedState] = mockFlipGamesDb.saveFlipGameState.mock.calls[0]!;
    const a = (savedState as FlipGameState).players.find((p) => p.id === "a")!;
    expect(a.hand).toHaveLength(1);
    expect(mockBroadcaster.broadcastGameState).toHaveBeenCalledTimes(1);
  });

  it("handleFlipHit rejects when it is not that player's turn", async () => {
    const state = buildFlipGameState({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      turnPlayerId: "a",
    });
    setStoredState(state);

    await expect(handleFlipHit(GAME_ID, "b")).rejects.toThrow("it is not this player's turn");
    expect(mockFlipGamesDb.saveFlipGameState).not.toHaveBeenCalled();
  });

  it("handleFlipFreeze locks the caller's hand and passes the turn", async () => {
    const state = buildFlipGameState({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      turnPlayerId: "a",
    });
    setStoredState(state);

    await handleFlipFreeze(GAME_ID, "a");

    const [, savedState] = mockFlipGamesDb.saveFlipGameState.mock.calls[0]!;
    const next = savedState as FlipGameState;
    expect(next.players.find((p) => p.id === "a")!.status).toBe("frozen");
    expect(next.turnPlayerId).toBe("b");
  });

  it("handleFlipChooseFreezeTarget resolves a pending freeze and freezes the chosen player", async () => {
    const state = buildFlipGameState({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      turnPlayerId: "a",
      pendingAction: { kind: "freeze" },
    });
    setStoredState(state);

    await handleFlipChooseFreezeTarget(GAME_ID, "a", "b");

    const [, savedState] = mockFlipGamesDb.saveFlipGameState.mock.calls[0]!;
    const next = savedState as FlipGameState;
    expect(next.players.find((p) => p.id === "b")!.status).toBe("frozen");
    expect(next.pendingAction).toBeNull();
  });

  it("handleFlipChooseFreezeTarget rejects a target chosen by someone other than the flipper", async () => {
    const state = buildFlipGameState({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      turnPlayerId: "a",
      pendingAction: { kind: "freeze" },
    });
    setStoredState(state);

    await expect(handleFlipChooseFreezeTarget(GAME_ID, "c", "b")).rejects.toThrow(
      "it is not this player's action to resolve",
    );
  });

  it("handleFlipChooseFlip3Target pushes a Flip 3 level and deals into it", async () => {
    const state = buildFlipGameState({
      players: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      turnPlayerId: "a",
      pendingAction: { kind: "flip3" },
    });
    setStoredState(state);

    await handleFlipChooseFlip3Target(GAME_ID, "a", "b");

    // Shoe is auto-filled (random draw order), so a stop condition (bust,
    // a drawn Freeze) can legitimately cut the 3 cards short — only assert
    // that dealing actually happened and the call persisted+broadcast.
    const [, savedState] = mockFlipGamesDb.saveFlipGameState.mock.calls[0]!;
    const next = savedState as FlipGameState;
    expect(next.players.find((p) => p.id === "b")!.hand.length).toBeGreaterThan(0);
    expect(mockBroadcaster.broadcastGameState).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when the game has no persisted Flip state", async () => {
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(null);
    await expect(handleFlipHit(GAME_ID, "a")).rejects.toThrow("Flip game not found");
  });
});
