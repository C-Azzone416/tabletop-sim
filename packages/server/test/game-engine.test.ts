import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGame, makePlayer, makeWire, makeTurn, resetIds } from "./fixtures.js";

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
  setPendingInterrogation: vi.fn(),
  clearPendingInterrogation: vi.fn(),
  setPendingDualCut: vi.fn(),
  clearPendingDualCut: vi.fn(),
}));

vi.mock("../src/db/players.js", () => ({
  createPlayer: vi.fn(),
  getPlayersByGameId: vi.fn(),
  getPlayerById: vi.fn(),
  markDoubleDetectorUsed: vi.fn(),
  markSetupDone: vi.fn(),
}));

vi.mock("../src/db/wires.js", () => ({
  createWire: vi.fn(),
  getWireById: vi.fn(),
  getWiresByGameId: vi.fn(),
  getWiresByPlayerId: vi.fn(),
  getWiresByValueAndGame: vi.fn(),
  getWiresByValueColorAndGame: vi.fn(),
  revealRedWires: vi.fn(),
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
      expect(mockPlayersDb.createPlayer).toHaveBeenCalledWith("g1", "Alice", 0, undefined);
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
    it("starts a game with 2 players, dealing wires and setting the captain's turn to kick off placement", async () => {
      const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
      const players = [
        makePlayer({ id: "p1", gameId: "g1", name: "Alice", seatOrder: 0, ready: true }),
        makePlayer({ id: "p2", gameId: "g1", name: "Bob", seatOrder: 1, ready: true }),
      ];
      const setupGame = { ...game, status: "setup" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateMission.mockResolvedValue(game);
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 0 });
      mockGamesDb.updateGameStatus.mockResolvedValue(setupGame);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1" });
      mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
        makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
      );

      const result = await engine.startGame("g1", "p1");

      expect(result.game.status).toBe("setup");
      expect(result.wires).toHaveLength(24);
      expect(result.players).toHaveLength(2);
      expect(result.game.detonatorMax).toBe(1);
      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p1");
      expect(result.game.currentTurnPlayerId).toBe("p1");
    });

    it.each([
      { playerCount: 1, expectedLives: 1, label: "1 player -> max(1, 0) = 1 life" },
      { playerCount: 3, expectedLives: 2, label: "3 players -> 2 lives" },
      { playerCount: 4, expectedLives: 3, label: "4 players -> 3 lives" },
    ])("calculates lives as players - 1, floored at 1 ($label)", async ({ playerCount, expectedLives }) => {
      const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
      const players = Array.from({ length: playerCount }, (_, i) =>
        makePlayer({ id: `p${i + 1}`, gameId: "g1", seatOrder: i, ready: true }));
      const setupGame = { ...game, status: "setup" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateMission.mockResolvedValue(game);
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 0 });
      mockGamesDb.updateGameStatus.mockResolvedValue(setupGame);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1" });
      mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
        makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
      );

      const result = await engine.startGame("g1", "p1");

      expect(result.game.detonatorMax).toBe(expectedLives);
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

    it("rejects if not every player has readied up in the lobby", async () => {
      const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", ready: true }),
        makePlayer({ id: "p2", ready: false }),
      ]);

      await expect(engine.startGame("g1", "p1")).rejects.toThrow("Not all players are ready");
      expect(mockGamesDb.updateMission).not.toHaveBeenCalled();
    });

    it("allows solo start once the lone captain has readied up (1 player, lives = max(1, 1-1) = 1)", async () => {
      const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
      const players = [makePlayer({ id: "p1", gameId: "g1", name: "Alice", seatOrder: 0, ready: true })];
      const setupGame = { ...game, status: "setup" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateMission.mockResolvedValue(game);
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 0 });
      mockGamesDb.updateGameStatus.mockResolvedValue(setupGame);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1" });
      mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
        makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
      );

      const result = await engine.startGame("g1", "p1");

      expect(result.game.status).toBe("setup");
      expect(result.players).toHaveLength(1);
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

  describe("executePlaceInfoToken", () => {
    function setUpTurnOrder(currentTurnPlayerId: string, players: ReturnType<typeof makePlayer>[]) {
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      return { currentTurnPlayerId };
    }

    it("places an info token on own wire, not the last player, so it just advances the turn", async () => {
      const players = [
        makePlayer({ id: "p1", gameId: "g1", seatOrder: 0 }),
        makePlayer({ id: "p2", gameId: "g1", seatOrder: 1 }),
      ];
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p1", value: "3", status: "hidden" });
      const otherWire = makeWire({ id: "w2", gameId: "g1", playerId: "p2", value: "5", status: "hidden" });
      const token = { id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "" };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockWiresDb.getWiresByGameId.mockResolvedValue([wire, otherWire]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([]);
      mockTokensDb.createInfoToken.mockResolvedValue(token);
      setUpTurnOrder("p1", players);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executePlaceInfoToken("g1", "p1", "w1");

      expect(result.infoToken).toEqual(token);
      expect(mockTokensDb.createInfoToken).toHaveBeenCalledWith("g1", "w1", "3");
      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p2");
      expect(mockGamesDb.updateGameStatus).not.toHaveBeenCalled();
    });

    it("activates the game and continues the turn rotation once the last player places", async () => {
      const players = [
        makePlayer({ id: "p1", gameId: "g1", seatOrder: 0 }),
        makePlayer({ id: "p2", gameId: "g1", seatOrder: 1 }),
      ];
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p2" });
      const wireP1 = makeWire({ id: "w1", gameId: "g1", playerId: "p1", value: "3", status: "hidden" });
      const wireP2 = makeWire({ id: "w2", gameId: "g1", playerId: "p2", value: "5", status: "hidden" });
      const existingToken = { id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "" };
      const newToken = { id: "t2", gameId: "g1", wireId: "w2", value: "5", placedAt: "" };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wireP2);
      mockWiresDb.getWiresByGameId.mockResolvedValue([wireP1, wireP2]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([existingToken]);
      mockTokensDb.createInfoToken.mockResolvedValue(newToken);
      setUpTurnOrder("p2", players);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p1" });
      mockGamesDb.updateGameStatus.mockResolvedValue({ ...game, status: "active", currentTurnPlayerId: "p1" });

      const result = await engine.executePlaceInfoToken("g1", "p2", "w2");

      expect(result.infoToken).toEqual(newToken);
      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p1");
      expect(mockGamesDb.updateGameStatus).toHaveBeenCalledWith("g1", "active");
    });

    it("rejects if it isn't the caller's turn", async () => {
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p2" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow("Not your turn");
    });

    it("rejects if player has already placed an info token", async () => {
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p1", value: "3", status: "hidden" });
      const existing = { id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "" };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockWiresDb.getWiresByGameId.mockResolvedValue([wire]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([existing]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([makePlayer({ id: "p1" })]);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow("Info token already placed");
    });

    it("rejects if game is not in setup phase", async () => {
      const game = makeGame({ id: "g1", status: "active" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow("Game is not in setup phase");
    });

    it("rejects if wire belongs to another player", async () => {
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", value: "3", status: "hidden" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow("Can only place info token on your own wire");
    });

    it("rejects if game does not exist", async () => {
      mockGamesDb.getGameById.mockResolvedValue(null);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow("Game not found");
    });

    it("rejects if wire does not exist", async () => {
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(null);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow("Wire not found");
    });

    it("rejects if wire belongs to a different game", async () => {
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g2", playerId: "p1", value: "3", status: "hidden" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow("Wire does not belong to this game");
    });

    it("rejects if wire is already cut or revealed", async () => {
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p1", value: "3", status: "cut" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow("Wire already cut or revealed");
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
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([
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
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([makeWire()]);
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

    it("loses the game when a failed cut pushes the detonator to its max", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorPosition: 3, detonatorMax: 4 });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const lostGame = { ...game, status: "lost" as const, detonatorPosition: 4 };

      mockGamesDb.getGameById.mockResolvedValueOnce(game);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([wire1]);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 4 });
      mockGamesDb.updateGameStatus.mockResolvedValue(lostGame);

      const result = await engine.executeSoloCut("g1", "p1", "5");

      expect(mockGamesDb.updateGameStatus).toHaveBeenCalledWith("g1", "lost");
      expect(result.game.status).toBe("lost");
      expect(result.turn.result).toBe("fail");
      // Loss short-circuits before validation/win/advance-turn checks
      expect(mockWiresDb.getWiresByGameId).not.toHaveBeenCalled();
      expect(mockGamesDb.updateCurrentTurn).not.toHaveBeenCalled();
    });

    it("wins the game when the successful cut clears the last hidden wire", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", color: "blue", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const wonGame = { ...game, status: "won" as const };

      mockGamesDb.getGameById.mockResolvedValueOnce(game);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([wire1]);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockResolvedValue({ ...wire1, status: "cut" });
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([makeWire({ status: "cut" })]);
      // All wires cut -> checkWinCondition returns true
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "cut" })]);
      mockGamesDb.updateGameStatus.mockResolvedValue(wonGame);

      const result = await engine.executeSoloCut("g1", "p1", "3");

      expect(mockGamesDb.updateGameStatus).toHaveBeenCalledWith("g1", "won");
      expect(result.game.status).toBe("won");
      expect(mockGamesDb.updateCurrentTurn).not.toHaveBeenCalled();
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

    it("rejects if the player is not found", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayerById.mockResolvedValue(null);

      await expect(
        engine.executeDoubleDetector("g1", "p1", "w1", "w2")
      ).rejects.toThrow("Player not found");
    });

    it("rejects if either wire does not exist", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const player = makePlayer({ id: "p1", doubleDetectorUsed: false });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayerById.mockResolvedValue(player);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(makeWire({ id: "w1", playerId: "p1" }))
        .mockResolvedValueOnce(null);

      await expect(
        engine.executeDoubleDetector("g1", "p1", "w1", "w2")
      ).rejects.toThrow("Wire not found");
    });

    it("rejects if either wire is not hidden", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const player = makePlayer({ id: "p1", doubleDetectorUsed: false });
      const wire1 = makeWire({ id: "w1", playerId: "p1", status: "cut" });
      const wire2 = makeWire({ id: "w2", playerId: "p1", status: "hidden" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayerById.mockResolvedValue(player);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(wire1)
        .mockResolvedValueOnce(wire2);

      await expect(
        engine.executeDoubleDetector("g1", "p1", "w1", "w2")
      ).rejects.toThrow("Target wires must be hidden");
    });
  });

  describe("executeRevealReds", () => {
    it("reveals all hidden red wires in a mission 5 game", async () => {
      const game = makeGame({ id: "g1", mission: 5, status: "active", currentTurnPlayerId: "p1" });
      const redWire1 = makeWire({ id: "rw1", gameId: "g1", playerId: "p1", color: "red", value: "1", status: "hidden" });
      const redWire2 = makeWire({ id: "rw2", gameId: "g1", playerId: "p2", color: "red", value: "1", status: "hidden" });
      const turn = makeTurn({ id: "t1", actionType: "reveal_reds" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.revealRedWires.mockResolvedValue([
        { ...redWire1, status: "revealed" as const },
        { ...redWire2, status: "revealed" as const },
      ]);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeRevealReds("g1", "p1");

      expect(result.turn.result).toBe("success");
      expect(result.updatedWires).toHaveLength(2);
      expect(result.updatedWires.every(w => w.status === "revealed")).toBe(true);
      expect(mockWiresDb.revealRedWires).toHaveBeenCalledWith("g1");
    });

    it("rejects in a mission without red wires (mission 1)", async () => {
      const game = makeGame({ id: "g1", mission: 1, status: "active", currentTurnPlayerId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeRevealReds("g1", "p1")).rejects.toThrow(
        "Reveal reds not available in this mission"
      );
    });

    it("rejects if not the active player's turn", async () => {
      const game = makeGame({ id: "g1", mission: 5, status: "active", currentTurnPlayerId: "p2" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeRevealReds("g1", "p1")).rejects.toThrow("Not your turn");
    });
  });

  describe("executeProposeDualCut", () => {
    it("sets pending dual cut with guess and returns game, wire, and target player", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden" });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });
      const updatedGame = { ...game, pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "3" };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockPlayersDb.getPlayerById.mockResolvedValue(targetPlayer);
      mockGamesDb.setPendingDualCut.mockResolvedValue(updatedGame);

      const result = await engine.executeProposeDualCut("g1", "p1", "w1", "3");

      expect(mockGamesDb.setPendingDualCut).toHaveBeenCalledWith("g1", "p1", "w1", "3");
      expect(result.game.pendingDualCutWireId).toBe("w1");
      expect(result.wire.id).toBe("w1");
      expect(result.targetPlayer.id).toBe("p2");
    });

    it("rejects if a dual cut is already pending", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", pendingDualCutWireId: "w1" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeProposeDualCut("g1", "p1", "w2", "3")).rejects.toThrow("Dual cut already pending");
    });

    it("rejects if the player targets their own wire", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p1", status: "hidden" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "3")).rejects.toThrow("Cannot target your own wire with dual cut");
    });

    it("rejects if wire is already cut", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "cut" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "3")).rejects.toThrow("Wire already cut or revealed");
    });

    it("rejects if wire has no value", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden", value: null as unknown as string });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockPlayersDb.getPlayerById.mockResolvedValue(targetPlayer);

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "3")).rejects.toThrow("Wire has no value");
    });

    it("rejects if DB rejects concurrent propose (TOCTOU guard)", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden" });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockPlayersDb.getPlayerById.mockResolvedValue(targetPlayer);
      mockGamesDb.setPendingDualCut.mockRejectedValueOnce(new Error("Dual cut already pending"));

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "3")).rejects.toThrow("Dual cut already pending");
    });

    it("rejects if target wire does not exist", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(null);

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "3")).rejects.toThrow("Wire not found");
    });

    it("rejects if target wire belongs to a different game", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g2", playerId: "p2", status: "hidden" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "3")).rejects.toThrow("Wire does not belong to this game");
    });

    it("rejects if target player is not found", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockPlayersDb.getPlayerById.mockResolvedValue(null);

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "3")).rejects.toThrow("Player not found");
    });
  });

  describe("executeRespondDualCut", () => {
    it("accepted: true reveals the target wire and returns phase=completing", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", value: "5", status: "hidden" });
      const revealedWire = { ...wire, status: "revealed" as const };

      mockGamesDb.getGameById
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockWiresDb.updateWireStatus.mockResolvedValue(revealedWire);

      const result = await engine.executeRespondDualCut("g1", "p2", true);

      expect(result.phase).toBe("completing");
      expect(result.updatedWires[0].status).toBe("revealed");
      expect(mockTokensDb.createInfoToken).not.toHaveBeenCalled();
      expect(mockGamesDb.clearPendingDualCut).not.toHaveBeenCalled();
    });

    it("accepted: false (blue wire) places info token with actual number, advances detonator", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
        detonatorPosition: 0, detonatorMax: 3,
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "blue", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1", gameId: "g1", playerId: "p1", actionType: "dual_cut" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };
      const detonatedGame = { ...clearedGame, detonatorPosition: 1 };
      const players = [makePlayer({ id: "p1", gameId: "g1" }), makePlayer({ id: "p2", gameId: "g1" })];

      mockGamesDb.getGameById
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(detonatedGame);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockGamesDb.updateDetonator.mockResolvedValue(detonatedGame);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...detonatedGame, currentTurnPlayerId: "p2" });

      const result = await engine.executeRespondDualCut("g1", "p2", false);

      expect(result.phase).toBe("fail");
      expect(mockTokensDb.createInfoToken).toHaveBeenCalledWith("g1", "w1", "3");
      expect(mockGamesDb.updateDetonator).toHaveBeenCalledWith("g1", 1);
    });

    it("accepted: false (yellow wire) places 'YELLOW' info token", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "2",
        detonatorPosition: 0, detonatorMax: 3,
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "yellow", value: "2", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };
      const detonatedGame = { ...clearedGame, detonatorPosition: 1 };

      mockGamesDb.getGameById
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(detonatedGame);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockGamesDb.updateDetonator.mockResolvedValue(detonatedGame);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([makePlayer({ id: "p1" }), makePlayer({ id: "p2" })]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...detonatedGame, currentTurnPlayerId: "p2" });

      const result = await engine.executeRespondDualCut("g1", "p2", false);

      expect(result.phase).toBe("fail");
      expect(mockTokensDb.createInfoToken).toHaveBeenCalledWith("g1", "w1", "YELLOW");
    });

    it("accepted: false (red wire) triggers immediate game over", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "1",
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "red", value: "1", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };
      const lostGame = { ...clearedGame, status: "lost" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockGamesDb.updateGameStatus.mockResolvedValue(lostGame);

      const result = await engine.executeRespondDualCut("g1", "p2", false);

      expect(result.phase).toBe("game_over");
      expect(result.game.status).toBe("lost");
      expect(mockTokensDb.createInfoToken).not.toHaveBeenCalled();
      expect(mockGamesDb.updateDetonator).not.toHaveBeenCalled();
    });

    it("rejects if there is no pending dual cut", async () => {
      const game = makeGame({ id: "g1", status: "active" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeRespondDualCut("g1", "p2", true)).rejects.toThrow("No pending dual cut");
    });

    it("rejects if the game does not exist", async () => {
      mockGamesDb.getGameById.mockResolvedValue(null);

      await expect(engine.executeRespondDualCut("g1", "p2", true)).rejects.toThrow("Game not found");
    });

    it("rejects if the game is not active", async () => {
      const game = makeGame({ id: "g1", status: "setup" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeRespondDualCut("g1", "p2", true)).rejects.toThrow("Game is not active");
    });

    it("rejects if the pending wire no longer exists", async () => {
      const game = makeGame({
        id: "g1", status: "active",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "3",
      });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(null);

      await expect(engine.executeRespondDualCut("g1", "p2", true)).rejects.toThrow("Wire not found");
    });

    it("rejects if the responding player does not own the wire", async () => {
      const game = makeGame({
        id: "g1", status: "active",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "3",
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p3" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executeRespondDualCut("g1", "p2", true)).rejects.toThrow("Not your wire to respond to");
    });

    it("game over when last life lost on blue wrong guess", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
        detonatorPosition: 2, detonatorMax: 3,
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "blue", value: "7" });
      const turn = makeTurn({ id: "t1" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };
      const lostGame = { ...clearedGame, status: "lost" as const, detonatorPosition: 3 };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockGamesDb.updateDetonator.mockResolvedValue(lostGame);
      mockGamesDb.updateGameStatus.mockResolvedValue(lostGame);

      const result = await engine.executeRespondDualCut("g1", "p2", false);

      expect(result.phase).toBe("game_over");
      expect(mockGamesDb.updateGameStatus).toHaveBeenCalledWith("g1", "lost");
      expect(result.game.status).toBe("lost");
    });
  });

  describe("executeCompleteDualCut", () => {
    it("cuts both wires (blue target: same value), creates turn record, advances turn", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "blue", value: "5", status: "revealed" });
      const ownWire = makeWire({ id: "w2", gameId: "g1", playerId: "p1", color: "blue", value: "5", status: "hidden" });
      const turn = makeTurn({ id: "t1", gameId: "g1", playerId: "p1", actionType: "dual_cut" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };
      const players = [makePlayer({ id: "p1", gameId: "g1" }), makePlayer({ id: "p2", gameId: "g1" })];

      mockGamesDb.getGameById
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(clearedGame);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(targetWire)
        .mockResolvedValueOnce(ownWire);
      mockWiresDb.updateWireStatus
        .mockResolvedValueOnce({ ...targetWire, status: "cut" as const })
        .mockResolvedValueOnce({ ...ownWire, status: "cut" as const });
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...clearedGame, currentTurnPlayerId: "p2" });

      const result = await engine.executeCompleteDualCut("g1", "p1", "w2");

      expect(result.turn.result).toBe("success");
      expect(result.updatedWires).toHaveLength(2);
      expect(result.updatedWires.every(w => w.status === "cut")).toBe(true);
      expect(mockGamesDb.clearPendingDualCut).toHaveBeenCalledWith("g1");
    });

    it("cuts both wires (yellow target: any yellow own wire)", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "2",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "yellow", value: "2", status: "revealed" });
      const ownWire = makeWire({ id: "w2", gameId: "g1", playerId: "p1", color: "yellow", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };

      mockGamesDb.getGameById
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(clearedGame);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(targetWire)
        .mockResolvedValueOnce(ownWire);
      mockWiresDb.updateWireStatus
        .mockResolvedValueOnce({ ...targetWire, status: "cut" as const })
        .mockResolvedValueOnce({ ...ownWire, status: "cut" as const });
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([makePlayer({ id: "p1" }), makePlayer({ id: "p2" })]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...clearedGame, currentTurnPlayerId: "p2" });

      const result = await engine.executeCompleteDualCut("g1", "p1", "w2");

      expect(result.turn.result).toBe("success");
    });

    it("rejects (blue target) if own wire doesn't match value", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "blue", value: "5", status: "revealed" });
      const ownWire = makeWire({ id: "w2", gameId: "g1", playerId: "p1", color: "blue", value: "3", status: "hidden" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(targetWire)
        .mockResolvedValueOnce(ownWire);

      await expect(engine.executeCompleteDualCut("g1", "p1", "w2")).rejects.toThrow("Must reveal a wire with the same number");
    });

    it("rejects (yellow target) if own wire isn't yellow", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "2",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "yellow", value: "2", status: "revealed" });
      const ownWire = makeWire({ id: "w2", gameId: "g1", playerId: "p1", color: "blue", value: "2", status: "hidden" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(targetWire)
        .mockResolvedValueOnce(ownWire);

      await expect(engine.executeCompleteDualCut("g1", "p1", "w2")).rejects.toThrow("Must reveal a yellow wire");
    });

    it("rejects if not the proposer", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeCompleteDualCut("g1", "p2", "w2")).rejects.toThrow("Not your turn to complete dual cut");
    });

    it("rejects if target wire is not revealed", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", value: "5", status: "hidden" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(targetWire);

      await expect(engine.executeCompleteDualCut("g1", "p1", "w2")).rejects.toThrow("Target wire is not revealed");
    });

    it("rejects if the game does not exist", async () => {
      mockGamesDb.getGameById.mockResolvedValue(null);

      await expect(engine.executeCompleteDualCut("g1", "p1", "w2")).rejects.toThrow("Game not found");
    });

    it("rejects if the game is not active", async () => {
      const game = makeGame({ id: "g1", status: "setup" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeCompleteDualCut("g1", "p1", "w2")).rejects.toThrow("Game is not active");
    });

    it("rejects if there is no pending dual cut", async () => {
      const game = makeGame({ id: "g1", status: "active" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeCompleteDualCut("g1", "p1", "w2")).rejects.toThrow("No pending dual cut");
    });

    it("rejects if own wire does not exist", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", value: "5", status: "revealed" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(targetWire)
        .mockResolvedValueOnce(null);

      await expect(engine.executeCompleteDualCut("g1", "p1", "w2")).rejects.toThrow("Wire not found");
    });

    it("rejects if own wire belongs to a different game", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "blue", value: "5", status: "revealed" });
      const ownWire = makeWire({ id: "w2", gameId: "g2", playerId: "p1", color: "blue", value: "5", status: "hidden" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(targetWire)
        .mockResolvedValueOnce(ownWire);

      await expect(engine.executeCompleteDualCut("g1", "p1", "w2")).rejects.toThrow("Wire does not belong to this game");
    });

    it("marks the game won when all wires are cut after completing the dual cut", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "blue", value: "5", status: "revealed" });
      const ownWire = makeWire({ id: "w2", gameId: "g1", playerId: "p1", color: "blue", value: "5", status: "hidden" });
      const turn = makeTurn({ id: "t1", gameId: "g1", playerId: "p1", actionType: "dual_cut" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };
      const wonGame = { ...clearedGame, status: "won" as const };

      mockGamesDb.getGameById
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(clearedGame);
      mockWiresDb.getWireById
        .mockResolvedValueOnce(targetWire)
        .mockResolvedValueOnce(ownWire);
      mockWiresDb.updateWireStatus
        .mockResolvedValueOnce({ ...targetWire, status: "cut" as const })
        .mockResolvedValueOnce({ ...ownWire, status: "cut" as const });
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([makeWire({ status: "hidden" })]);
      // All wires cut -> checkWinCondition returns true
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "cut" }), makeWire({ status: "cut" })]);
      mockGamesDb.updateGameStatus.mockResolvedValue(wonGame);

      const result = await engine.executeCompleteDualCut("g1", "p1", "w2");

      expect(mockGamesDb.updateGameStatus).toHaveBeenCalledWith("g1", "won");
      expect(mockGamesDb.updateCurrentTurn).not.toHaveBeenCalled();
      expect(result.game.status).toBe("won");
    });
  });
});
