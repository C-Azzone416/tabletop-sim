import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGame, makePlayer, makeWire, makeTurn, resetIds } from "./fixtures.js";
import type { Game, Player, Wire } from "@tabletop/shared";

// Mock all DB modules
vi.mock("../src/db/games.js", () => ({
  createGame: vi.fn(),
  getGameById: vi.fn(),
  getGameByJoinCode: vi.fn(),
  updateGameStatus: vi.fn(),
  updateGameCaptain: vi.fn(),
  updateCurrentTurn: vi.fn(),
  updateDetonator: vi.fn(),
  updateMission: vi.fn(),
}));

vi.mock("../src/db/players.js", () => ({
  createPlayer: vi.fn(),
  getPlayersByGameId: vi.fn(),
  getPlayerById: vi.fn(),
  markDoubleDetectorUsed: vi.fn(),
}));

vi.mock("../src/db/wires.js", () => ({
  createWire: vi.fn(),
  getWireById: vi.fn(),
  getWiresByGameId: vi.fn(),
  getWiresByPlayerId: vi.fn(),
  getWiresByValueAndGame: vi.fn(),
  updateWireStatus: vi.fn(),
}));

vi.mock("../src/db/tokens.js", () => ({
  createInfoToken: vi.fn(),
  createValidationToken: vi.fn(),
  getInfoTokensByGameId: vi.fn(),
  getValidationTokensByGameId: vi.fn(),
}));

vi.mock("../src/db/turns.js", () => ({
  createTurn: vi.fn(),
  updateTurnResult: vi.fn(),
  getTurnsByGameId: vi.fn(),
}));

import * as gamesDb from "../src/db/games.js";
import * as playersDb from "../src/db/players.js";
import * as wiresDb from "../src/db/wires.js";
import * as tokensDb from "../src/db/tokens.js";
import * as turnsDb from "../src/db/turns.js";
import * as engine from "../src/engine/game-engine.js";

const mockGamesDb = vi.mocked(gamesDb);
const mockPlayersDb = vi.mocked(playersDb);
const mockWiresDb = vi.mocked(wiresDb);
const mockTokensDb = vi.mocked(tokensDb);
const mockTurnsDb = vi.mocked(turnsDb);

describe("game-engine", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
  });

  describe("createGame", () => {
    it("creates a game and assigns the creator as captain", async () => {
      const game = makeGame({ id: "g1" });
      const player = makePlayer({ id: "p1", gameId: "g1", name: "Alice" });
      const captainGame = { ...game, captainId: "p1" };

      mockGamesDb.createGame.mockResolvedValue(game);
      mockPlayersDb.createPlayer.mockResolvedValue(player);
      mockGamesDb.updateGameCaptain.mockResolvedValue(captainGame);

      const result = await engine.createGame("Alice");

      expect(result.game.captainId).toBe("p1");
      expect(result.player.name).toBe("Alice");
      expect(mockGamesDb.createGame).toHaveBeenCalled();
      expect(mockPlayersDb.createPlayer).toHaveBeenCalledWith("g1", "Alice", 0);
      expect(mockGamesDb.updateGameCaptain).toHaveBeenCalledWith("g1", "p1");
    });
  });

  describe("joinGame", () => {
    it("joins an existing waiting game", async () => {
      const game = makeGame({ id: "g1", status: "waiting", joinCode: "XYZ789" });
      const existingPlayer = makePlayer({ id: "p1", gameId: "g1" });
      const newPlayer = makePlayer({ id: "p2", gameId: "g1", name: "Bob", seatOrder: 1 });

      mockGamesDb.getGameByJoinCode.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId
        .mockResolvedValueOnce([existingPlayer])
        .mockResolvedValueOnce([existingPlayer, newPlayer]);
      mockPlayersDb.createPlayer.mockResolvedValue(newPlayer);

      const result = await engine.joinGame("XYZ789", "Bob");

      expect(result.player.name).toBe("Bob");
      expect(result.players).toHaveLength(2);
    });

    it("rejects joining a non-existent game", async () => {
      mockGamesDb.getGameByJoinCode.mockResolvedValue(null);
      await expect(engine.joinGame("NOPE", "Bob")).rejects.toThrow("Game not found");
    });

    it("rejects joining a started game", async () => {
      const game = makeGame({ id: "g1", status: "active" });
      mockGamesDb.getGameByJoinCode.mockResolvedValue(game);
      await expect(engine.joinGame("ABC123", "Bob")).rejects.toThrow("Game already started");
    });

    it("rejects joining a full game (4 players)", async () => {
      const game = makeGame({ id: "g1", status: "waiting" });
      const players = Array.from({ length: 4 }, (_, i) =>
        makePlayer({ id: `p${i}`, gameId: "g1" })
      );

      mockGamesDb.getGameByJoinCode.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      await expect(engine.joinGame("ABC123", "Extra")).rejects.toThrow("Game is full");
    });
  });

  describe("startGame", () => {
    it("starts a game with 2 players", async () => {
      const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
      const players = [
        makePlayer({ id: "p1", gameId: "g1", name: "Alice", seatOrder: 0 }),
        makePlayer({ id: "p2", gameId: "g1", name: "Bob", seatOrder: 1 }),
      ];
      const setupGame = { ...game, status: "setup" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateMission.mockResolvedValue(game);
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 0 });
      mockGamesDb.updateGameStatus.mockResolvedValue(setupGame);
      mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
        makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
      );

      const result = await engine.startGame("g1", "p1");

      expect(result.game.status).toBe("setup");
      expect(result.wires).toHaveLength(24);
      expect(result.players).toHaveLength(2);
    });

    it("rejects if not the captain", async () => {
      const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1" }),
        makePlayer({ id: "p2" }),
      ]);

      await expect(engine.startGame("g1", "p2")).rejects.toThrow(
        "Only the captain can start the game"
      );
    });

    it("rejects with fewer than 2 players", async () => {
      const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1" }),
      ]);

      await expect(engine.startGame("g1", "p1")).rejects.toThrow(
        "Need at least 2 players"
      );
    });

    it("rejects if game already started", async () => {
      const game = makeGame({ id: "g1", status: "active", captainId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.startGame("g1", "p1")).rejects.toThrow("Game already started");
    });
  });

  describe("completeSetup", () => {
    it("transitions from setup to active with captain as first turn", async () => {
      const game = makeGame({ id: "g1", status: "setup", captainId: "p1" });
      const players = [
        makePlayer({ id: "p1", gameId: "g1", seatOrder: 0 }),
        makePlayer({ id: "p2", gameId: "g1", seatOrder: 1 }),
      ];
      const activeGame = { ...game, status: "active" as const, currentTurnPlayerId: "p1" };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p1" });
      mockGamesDb.updateGameStatus.mockResolvedValue(activeGame);

      const result = await engine.completeSetup("g1");

      expect(result.status).toBe("active");
      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p1");
    });

    it("rejects if game is not in setup phase", async () => {
      const game = makeGame({ id: "g1", status: "active" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.completeSetup("g1")).rejects.toThrow("Game is not in setup phase");
    });
  });

  describe("executeDuoCut", () => {
    it("succeeds when guess matches wire value", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        detonatorPosition: 0, detonatorMax: 4,
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1", gameId: "g1", playerId: "p1", actionType: "duo_cut" });
      const cutWire = { ...wire, status: "cut" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockResolvedValue(cutWire);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue([cutWire, makeWire({ status: "hidden" }), makeWire({ status: "hidden" }), makeWire({ status: "hidden" })]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([cutWire, makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeDuoCut("g1", "p1", "w1", "3");

      expect(result.turn.result).toBe("success");
      expect(result.updatedWires[0].status).toBe("cut");
    });

    it("fails and advances detonator on wrong guess", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        detonatorPosition: 0, detonatorMax: 4,
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const cutWire = { ...wire, status: "cut" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockResolvedValue(cutWire);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockTokensDb.createInfoToken.mockResolvedValue({
        id: "it1", gameId: "g1", wireId: "w1", value: "3", placedAt: "2026-01-01",
      });
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 1 });
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue([cutWire, makeWire(), makeWire(), makeWire()]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([cutWire, makeWire()]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeDuoCut("g1", "p1", "w1", "5");

      expect(result.turn.result).toBe("fail");
      expect(mockGamesDb.updateDetonator).toHaveBeenCalledWith("g1", 1);
    });

    it("causes game loss when detonator maxes out", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        detonatorPosition: 3, detonatorMax: 4,
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const cutWire = { ...wire, status: "cut" as const };
      const lostGame = { ...game, status: "lost" as const, detonatorPosition: 4 };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockResolvedValue(cutWire);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockTokensDb.createInfoToken.mockResolvedValue({
        id: "it1", gameId: "g1", wireId: "w1", value: "3", placedAt: "2026-01-01",
      });
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 4 });
      mockGamesDb.updateGameStatus.mockResolvedValue(lostGame);

      const result = await engine.executeDuoCut("g1", "p1", "w1", "5");

      expect(result.game.status).toBe("lost");
    });

    it("rejects cutting your own wire", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executeDuoCut("g1", "p1", "w1", "3")).rejects.toThrow(
        "Cannot cut your own wire with duo cut"
      );
    });

    it("rejects if not your turn", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p2" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeDuoCut("g1", "p1", "w1", "3")).rejects.toThrow("Not your turn");
    });
  });

  describe("executeSoloCut", () => {
    it("succeeds when player has matching hidden wires", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" });
      const wire2 = makeWire({ id: "w2", playerId: "p1", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1" });

      mockGamesDb.getGameById
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(game);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([wire1, wire2]);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockImplementation(async (id) =>
        makeWire({ id, status: "cut" })
      );
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue([
        makeWire({ status: "cut" }), makeWire({ status: "cut" }),
        makeWire({ status: "hidden" }), makeWire({ status: "hidden" }),
      ]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeSoloCut("g1", "p1", "3");

      expect(result.turn.result).toBe("success");
      expect(result.updatedWires).toHaveLength(2);
    });

    it("fails and advances detonator when no matching wires", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1" });

      mockGamesDb.getGameById
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(game);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([wire1]);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 1 });
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue([makeWire()]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeSoloCut("g1", "p1", "5");

      expect(result.turn.result).toBe("fail");
      expect(mockGamesDb.updateDetonator).toHaveBeenCalled();
    });
  });

  describe("executeDoubleDetector", () => {
    it("succeeds when both wires have the same value", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const player = makePlayer({ id: "p1", doubleDetectorUsed: false });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" });
      const wire2 = makeWire({ id: "w2", playerId: "p1", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayerById.mockResolvedValue(player);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(wire1)
        .mockResolvedValueOnce(wire2);
      mockPlayersDb.markDoubleDetectorUsed.mockResolvedValue({ ...player, doubleDetectorUsed: true });
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeDoubleDetector("g1", "p1", "w1", "w2");

      expect(result.turn.result).toBe("success");
      expect(result.updatedWires).toEqual([]);
    });

    it("fails when wires have different values", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const player = makePlayer({ id: "p1", doubleDetectorUsed: false });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" });
      const wire2 = makeWire({ id: "w2", playerId: "p1", value: "5", status: "hidden" });
      const turn = makeTurn({ id: "t1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayerById.mockResolvedValue(player);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(wire1)
        .mockResolvedValueOnce(wire2);
      mockPlayersDb.markDoubleDetectorUsed.mockResolvedValue({ ...player, doubleDetectorUsed: true });
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeDoubleDetector("g1", "p1", "w1", "w2");

      expect(result.turn.result).toBe("fail");
    });

    it("rejects if already used", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const player = makePlayer({ id: "p1", doubleDetectorUsed: true });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayerById.mockResolvedValue(player);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(makeWire({ id: "w1", playerId: "p1" }))
        .mockResolvedValueOnce(makeWire({ id: "w2", playerId: "p1" }));

      await expect(
        engine.executeDoubleDetector("g1", "p1", "w1", "w2")
      ).rejects.toThrow("Double detector already used");
    });

    it("rejects targeting other player's wires", async () => {
      // Reset mocks explicitly to avoid leaking from previous tests
      mockGamesDb.getGameById.mockReset();
      mockPlayersDb.getPlayerById.mockReset();
      mockWiresDb.getWireById.mockReset();
      mockPlayersDb.markDoubleDetectorUsed.mockReset();

      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const player = makePlayer({ id: "p1", doubleDetectorUsed: false });
      const wire1 = makeWire({ id: "w1", playerId: "p2", gameId: "g1", status: "hidden" });
      const wire2 = makeWire({ id: "w2", playerId: "p1", gameId: "g1", status: "hidden" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayerById.mockResolvedValue(player);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(wire1)
        .mockResolvedValueOnce(wire2);

      await expect(
        engine.executeDoubleDetector("g1", "p1", "w1", "w2")
      ).rejects.toThrow("Double detector can only target your own wires");
    });
  });
});
