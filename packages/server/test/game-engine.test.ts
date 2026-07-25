import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGame, makePlayer, makeWire, makeTurn, resetIds } from "./fixtures.js";

// Mock all DB modules
vi.mock("../src/db/games.js", () => ({
  createGame: vi.fn(),
  getGameById: vi.fn(),
  getGameByJoinCode: vi.fn(),
  getGameCreatedVia: vi.fn(),
  updateGameStatus: vi.fn(),
  updateGameCaptain: vi.fn(),
  updateCurrentTurn: vi.fn(),
  updateDetonator: vi.fn(),
  updateDetonatorMax: vi.fn(),
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
  getPlayerProfileId: vi.fn(),
  getPlayerProfileIdsByGameId: vi.fn(),
  markDoubleDetectorUsed: vi.fn(),
  markSetupDone: vi.fn(),
  resetDoubleDetectorForGame: vi.fn(),
}));

vi.mock("../src/db/wires.js", () => ({
  createWire: vi.fn(),
  getWireById: vi.fn(),
  getWiresByGameId: vi.fn(),
  getWiresByPlayerId: vi.fn(),
  getWiresByValueAndGame: vi.fn(),
  getWiresByValueColorAndGame: vi.fn(),
  getWiresByColorAndGame: vi.fn(),
  revealRedWires: vi.fn(),
  revealRedWiresForPlayer: vi.fn(),
  updateWireStatus: vi.fn(),
  deleteByGameId: vi.fn(),
}));

vi.mock("../src/db/tokens.js", () => ({
  createInfoToken: vi.fn(),
  createValidationToken: vi.fn(),
  getInfoTokensByGameId: vi.fn(),
  getValidationTokensByGameId: vi.fn(),
  deleteValidationTokensByGameId: vi.fn(),
}));

vi.mock("../src/db/turns.js", () => ({
  createTurn: vi.fn(),
  updateTurnResult: vi.fn(),
  getTurnsByGameId: vi.fn(),
  deleteByGameId: vi.fn(),
}));

vi.mock("../src/db/outcomes.js", () => ({
  upsertMissionOutcome: vi.fn(),
  getMissionOutcomesByProfileId: vi.fn(),
}));

import * as gamesDb from "../src/db/games.js";
import * as playersDb from "../src/db/players.js";
import * as wiresDb from "../src/db/wires.js";
import * as tokensDb from "../src/db/tokens.js";
import * as turnsDb from "../src/db/turns.js";
import * as outcomesDb from "../src/db/outcomes.js";
import * as engine from "../src/engine/game-engine.js";

const mockGamesDb = vi.mocked(gamesDb);
const mockPlayersDb = vi.mocked(playersDb);
const mockWiresDb = vi.mocked(wiresDb);
const mockTokensDb = vi.mocked(tokensDb);
const mockTurnsDb = vi.mocked(turnsDb);
const mockOutcomesDb = vi.mocked(outcomesDb);

describe("game-engine", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
    // endGame (#170) fetches seated profile ids and created_via on every
    // won/lost transition; default to none / 'lobby' so existing win/loss
    // tests run unchanged.
    mockPlayersDb.getPlayerProfileIdsByGameId.mockResolvedValue([]);
    mockGamesDb.getGameCreatedVia.mockResolvedValue("lobby");
    // #179 — unlock check no-ops when the captain has no profileId, so
    // existing startGame/executeNextMission tests (mission 1, always
    // unlocked) run unchanged unless a test opts in below.
    mockPlayersDb.getPlayerProfileId.mockResolvedValue(null);
    delete process.env.ENABLE_DEV_SEED;
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
      mockGamesDb.updateDetonatorMax.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1", detonatorMax: 1 });
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

    it("persists the computed detonatorMax to the DB, not just the returned object (issue #137)", async () => {
      const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
      const players = [
        makePlayer({ id: "p1", gameId: "g1", seatOrder: 0, ready: true }),
        makePlayer({ id: "p2", gameId: "g1", seatOrder: 1, ready: true }),
        makePlayer({ id: "p3", gameId: "g1", seatOrder: 2, ready: true }),
        makePlayer({ id: "p4", gameId: "g1", seatOrder: 3, ready: true }),
      ];
      const setupGame = { ...game, status: "setup" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateMission.mockResolvedValue(game);
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 0 });
      mockGamesDb.updateGameStatus.mockResolvedValue(setupGame);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1" });
      mockGamesDb.updateDetonatorMax.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1", detonatorMax: 3 });
      mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
        makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
      );

      const result = await engine.startGame("g1", "p1");

      // The DB write itself is the assertion that matters here — result.game
      // comes straight from updateDetonatorMax's return, not a JS-side spread,
      // so this proves the value is actually persisted (issue #137), not just
      // computed and handed back in the one-time response.
      expect(mockGamesDb.updateDetonatorMax).toHaveBeenCalledWith("g1", 3);
      expect(result.game.detonatorMax).toBe(3);
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
      mockGamesDb.updateDetonatorMax.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1", detonatorMax: expectedLives });
      mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
        makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
      );

      const result = await engine.startGame("g1", "p1");

      expect(mockGamesDb.updateDetonatorMax).toHaveBeenCalledWith("g1", expectedLives);
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
      mockGamesDb.updateDetonatorMax.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1", detonatorMax: 1 });
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

    describe("#179 mission-unlock enforcement", () => {
      function setUpReady() {
        const game = makeGame({ id: "g1", status: "waiting", captainId: "p1" });
        const players = [makePlayer({ id: "p1", gameId: "g1", seatOrder: 0, ready: true })];
        mockGamesDb.getGameById.mockResolvedValue(game);
        mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
        mockPlayersDb.getPlayerProfileId.mockResolvedValue("prof-1");
      }

      it("rejects a locked mission for a fresh profile with no outcomes", async () => {
        setUpReady();
        mockOutcomesDb.getMissionOutcomesByProfileId.mockResolvedValue([]);

        await expect(engine.startGame("g1", "p1", 2)).rejects.toThrow("Mission is locked");
        expect(mockGamesDb.updateMission).not.toHaveBeenCalled();
      });

      it("allows mission 2 once mission 1 has been won", async () => {
        setUpReady();
        mockOutcomesDb.getMissionOutcomesByProfileId.mockResolvedValue([
          { profileId: "prof-1", mission: 1, outcome: "won", updatedAt: "2026-07-24T00:00:00Z" },
        ]);
        const setupGame = { id: "g1", status: "setup" as const, captainId: "p1", mission: 2 } as ReturnType<typeof makeGame>;
        mockGamesDb.updateMission.mockResolvedValue(setupGame);
        mockGamesDb.updateDetonator.mockResolvedValue(setupGame);
        mockGamesDb.updateGameStatus.mockResolvedValue(setupGame);
        mockGamesDb.updateCurrentTurn.mockResolvedValue(setupGame);
        mockGamesDb.updateDetonatorMax.mockResolvedValue(setupGame);
        mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
          makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
        );

        const result = await engine.startGame("g1", "p1", 2);

        expect(result.game.mission).toBe(2);
      });

      it("does not unlock mission 2 from a loss", async () => {
        setUpReady();
        mockOutcomesDb.getMissionOutcomesByProfileId.mockResolvedValue([
          { profileId: "prof-1", mission: 1, outcome: "lost", updatedAt: "2026-07-24T00:00:00Z" },
        ]);

        await expect(engine.startGame("g1", "p1", 2)).rejects.toThrow("Mission is locked");
      });

      it("skips the unlock check when ENABLE_DEV_SEED is true", async () => {
        setUpReady();
        process.env.ENABLE_DEV_SEED = "true";
        const setupGame = { id: "g1", status: "setup" as const, captainId: "p1", mission: 8 } as ReturnType<typeof makeGame>;
        mockGamesDb.updateMission.mockResolvedValue(setupGame);
        mockGamesDb.updateDetonator.mockResolvedValue(setupGame);
        mockGamesDb.updateGameStatus.mockResolvedValue(setupGame);
        mockGamesDb.updateCurrentTurn.mockResolvedValue(setupGame);
        mockGamesDb.updateDetonatorMax.mockResolvedValue(setupGame);
        mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
          makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
        );

        const result = await engine.startGame("g1", "p1", 8);

        expect(result.game.mission).toBe(8);
        expect(mockOutcomesDb.getMissionOutcomesByProfileId).not.toHaveBeenCalled();
      });

      it("still enforces the unlock check when ENABLE_DEV_SEED is true but NODE_ENV is production", async () => {
        setUpReady();
        process.env.ENABLE_DEV_SEED = "true";
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        mockOutcomesDb.getMissionOutcomesByProfileId.mockResolvedValue([]);

        await expect(engine.startGame("g1", "p1", 2)).rejects.toThrow("Mission is locked");

        process.env.NODE_ENV = originalNodeEnv;
      });
    });
  });

  describe("executeNextMission", () => {
    function setUp(status: "won" | "lost") {
      const game = makeGame({ id: "g1", status, captainId: "p1", mission: 1, joinCode: "ABC123" });
      const players = [
        makePlayer({ id: "p1", gameId: "g1", name: "Alice", seatOrder: 0 }),
        makePlayer({ id: "p2", gameId: "g1", name: "Bob", seatOrder: 1 }),
      ];
      const setupGame = { ...game, status: "setup" as const, mission: 2 };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockGamesDb.updateMission.mockResolvedValue({ ...game, mission: 2 });
      mockGamesDb.updateDetonator.mockResolvedValue({ ...game, detonatorPosition: 0 });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(game);
      mockGamesDb.updateGameStatus.mockResolvedValue(setupGame);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1" });
      mockGamesDb.updateDetonatorMax.mockResolvedValue({ ...setupGame, currentTurnPlayerId: "p1", detonatorMax: 1 });
      mockWiresDb.createWire.mockImplementation(async (_gid, _pid, val, col, pos) =>
        makeWire({ gameId: "g1", value: val, color: col, rackPosition: pos })
      );
      return { game, players };
    }

    it("reuses the same game row (same id/joinCode) to start the next mission after a win", async () => {
      setUp("won");

      const result = await engine.executeNextMission("g1", "p1", 2);

      expect(result.game.status).toBe("setup");
      expect(result.game.mission).toBe(2);
      expect(result.wires).toHaveLength(24);
      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p1");
    });

    it("reuses the same game row to retry/pick a mission after a loss", async () => {
      setUp("lost");

      const result = await engine.executeNextMission("g1", "p1", 1);

      expect(result.game.status).toBe("setup");
      expect(mockGamesDb.getGameById).toHaveBeenCalledWith("g1");
    });

    it("clears the prior mission's turns, wires, and validation tokens before dealing new wires — in FK-safe order", async () => {
      setUp("won");
      const calls: string[] = [];
      mockTurnsDb.deleteByGameId.mockImplementation(async () => { calls.push("turns"); });
      mockWiresDb.deleteByGameId.mockImplementation(async () => { calls.push("wires"); });
      mockTokensDb.deleteValidationTokensByGameId.mockImplementation(async () => { calls.push("validationTokens"); });

      await engine.executeNextMission("g1", "p1", 2);

      expect(calls).toEqual(["turns", "wires", "validationTokens"]);
    });

    it("resets double-detector usage for every seated player", async () => {
      setUp("won");

      await engine.executeNextMission("g1", "p1", 2);

      expect(mockPlayersDb.resetDoubleDetectorForGame).toHaveBeenCalledWith("g1");
    });

    it("rejects on a game that is still active (won/lost precondition, per heron's note: nothing destructive runs on an active game)", async () => {
      const game = makeGame({ id: "g1", status: "active", captainId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeNextMission("g1", "p1", 2)).rejects.toThrow(
        "Game is not in a won or lost state"
      );
      expect(mockTurnsDb.deleteByGameId).not.toHaveBeenCalled();
      expect(mockWiresDb.deleteByGameId).not.toHaveBeenCalled();
    });

    it("rejects a non-captain requester", async () => {
      const game = makeGame({ id: "g1", status: "won", captainId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeNextMission("g1", "p2", 2)).rejects.toThrow(
        "Only the captain can start the next mission"
      );
      expect(mockTurnsDb.deleteByGameId).not.toHaveBeenCalled();
    });

    it("rejects an invalid mission number before any delete runs", async () => {
      const game = makeGame({ id: "g1", status: "lost", captainId: "p1" });
      mockGamesDb.getGameById.mockResolvedValue(game);

      await expect(engine.executeNextMission("g1", "p1", 99)).rejects.toThrow("Invalid mission");
      expect(mockTurnsDb.deleteByGameId).not.toHaveBeenCalled();
    });

    describe("#179 mission-unlock enforcement", () => {
      it("rejects picking a locked mission for the next mission", async () => {
        setUp("won");
        mockPlayersDb.getPlayerProfileId.mockResolvedValue("prof-1");
        mockOutcomesDb.getMissionOutcomesByProfileId.mockResolvedValue([]);

        await expect(engine.executeNextMission("g1", "p1", 3)).rejects.toThrow("Mission is locked");
        expect(mockTurnsDb.deleteByGameId).not.toHaveBeenCalled();
      });

      it("allows an unlocked next mission", async () => {
        setUp("won");
        mockPlayersDb.getPlayerProfileId.mockResolvedValue("prof-1");
        mockOutcomesDb.getMissionOutcomesByProfileId.mockResolvedValue([
          { profileId: "prof-1", mission: 1, outcome: "won", updatedAt: "2026-07-24T00:00:00Z" },
        ]);

        const result = await engine.executeNextMission("g1", "p1", 2);

        expect(result.game.mission).toBe(2);
      });

      it("skips the unlock check when ENABLE_DEV_SEED is true", async () => {
        setUp("won");
        process.env.ENABLE_DEV_SEED = "true";
        mockPlayersDb.getPlayerProfileId.mockResolvedValue("prof-1");

        const result = await engine.executeNextMission("g1", "p1", 8);

        expect(result.game).toBeDefined();
        expect(mockOutcomesDb.getMissionOutcomesByProfileId).not.toHaveBeenCalled();
      });
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

    it("rejects placing an opening info token on a non-blue wire (#191)", async () => {
      const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p1", value: "3", color: "red", status: "hidden" });
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);

      await expect(engine.executePlaceInfoToken("g1", "p1", "w1")).rejects.toThrow(
        "Opening info token must be placed on a blue wire"
      );
      expect(mockTokensDb.createInfoToken).not.toHaveBeenCalled();
    });
  });

  describe("executeSoloCut", () => {
    it("succeeds when player holds all 4 wires of that number (never split)", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const wires = [1, 2, 3, 4].map(n => makeWire({ id: `w${n}`, playerId: "p1", value: "3", status: "hidden" }));
      const turn = makeTurn({ id: "t1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue(wires);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockImplementation(async (id) =>
        makeWire({ id, status: "cut" })
      );
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue(wires.map(w => ({ ...w, status: "cut" as const })));
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeSoloCut("g1", "p1", "3");

      expect(result.turn.result).toBe("success");
      expect(result.updatedWires).toHaveLength(4);
    });

    it("succeeds when player holds the last 2 remaining after 2 were already cut", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const cutWires = [1, 2].map(n => makeWire({ id: `w${n}`, playerId: "p2", value: "3", status: "cut" }));
      const heldWires = [3, 4].map(n => makeWire({ id: `w${n}`, playerId: "p1", value: "3", status: "hidden" }));
      const turn = makeTurn({ id: "t1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue([...cutWires, ...heldWires]);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockImplementation(async (id) =>
        makeWire({ id, status: "cut" })
      );
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([
        ...cutWires, ...heldWires.map(w => ({ ...w, status: "cut" as const })),
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

    it("rejects when the player holds some but not all remaining uncut wires of that number", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "3", status: "hidden" }),
      ];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue(wires);

      await expect(engine.executeSoloCut("g1", "p1", "3")).rejects.toThrow(
        "You must hold all remaining uncut wires of that number to solo cut it"
      );
      expect(mockTurnsDb.createTurn).not.toHaveBeenCalled();
      expect(mockGamesDb.updateDetonator).not.toHaveBeenCalled();
      expect(mockWiresDb.updateWireStatus).not.toHaveBeenCalled();
    });

    it("rejects when the player holds zero of the remaining uncut wires of that number", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const wires = [makeWire({ id: "w1", playerId: "p2", value: "5", status: "hidden" })];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue(wires);

      await expect(engine.executeSoloCut("g1", "p1", "5")).rejects.toThrow(
        "You must hold all remaining uncut wires of that number to solo cut it"
      );
      expect(mockTurnsDb.createTurn).not.toHaveBeenCalled();
      expect(mockGamesDb.updateDetonator).not.toHaveBeenCalled();
    });

    it("rejects when every wire of that number is already cut (nothing left to solo cut)", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const wires = [1, 2, 3, 4].map(n => makeWire({ id: `w${n}`, playerId: "p1", value: "3", status: "cut" }));
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue(wires);

      await expect(engine.executeSoloCut("g1", "p1", "3")).rejects.toThrow(
        "You must hold all remaining uncut wires of that number to solo cut it"
      );
      expect(mockTurnsDb.createTurn).not.toHaveBeenCalled();
    });

    it("wins the game when the successful cut clears the last hidden wire", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", color: "blue", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const wonGame = { ...game, status: "won" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue([wire1]);
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

    // #190 Phase B: yellow solo-cut is color-scoped (any values, not a
    // specific number — yellow has no in-play numeric identity), reusing
    // the 'YELLOW' sentinel already used for the dual-cut wrong-guess
    // indicator. Legality mirrors #150 exactly: holds ALL remaining hidden
    // yellow wires in the game, or it's illegal.
    it("yellow solo-cut ('YELLOW' sentinel) succeeds when player holds all remaining hidden yellow wires", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const yellowWires = [
        makeWire({ id: "w1", playerId: "p1", color: "yellow", value: "2.1", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p1", color: "yellow", value: "5.1", status: "hidden" }),
      ];
      const turn = makeTurn({ id: "t1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByColorAndGame.mockResolvedValue(yellowWires);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockImplementation(async (id) => makeWire({ id, status: "cut" }));
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "hidden" })]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.executeSoloCut("g1", "p1", "YELLOW");

      expect(mockWiresDb.getWiresByColorAndGame).toHaveBeenCalledWith("g1", "yellow");
      expect(result.turn.result).toBe("success");
      expect(result.updatedWires).toHaveLength(2);
      // Distinct values validated individually, not grouped under the sentinel.
      expect(mockWiresDb.getWiresByValueColorAndGame).toHaveBeenCalledWith("g1", "2.1", "yellow");
      expect(mockWiresDb.getWiresByValueColorAndGame).toHaveBeenCalledWith("g1", "5.1", "yellow");
    });

    it("yellow solo-cut rejects when the player doesn't hold all remaining hidden yellow wires", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", detonatorMax: 4 });
      const yellowWires = [
        makeWire({ id: "w1", playerId: "p1", color: "yellow", value: "2.1", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", color: "yellow", value: "5.1", status: "hidden" }),
      ];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByColorAndGame.mockResolvedValue(yellowWires);

      await expect(engine.executeSoloCut("g1", "p1", "YELLOW")).rejects.toThrow(
        "You must hold all remaining yellow wires to solo cut them"
      );
      expect(mockTurnsDb.createTurn).not.toHaveBeenCalled();
      expect(mockWiresDb.updateWireStatus).not.toHaveBeenCalled();
    });
  });

  describe("mission outcome recording (#170)", () => {
    // Negative-path test per the #decisions 2026-07-24 policy and the #170
    // amendment (dingo 03:23, heron 03:39): a dev-seeded win/loss must write
    // ZERO outcome rows, even when seated profiles exist — dev-seeded games
    // are not real play and would pollute the home-screen indicators.
    it("records nothing on a dev-seeded win, even with seated profiles", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", mission: 3, detonatorMax: 4 });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", color: "blue", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const wonGame = { ...game, status: "won" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue([wire1]);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockResolvedValue({ ...wire1, status: "cut" });
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([makeWire({ status: "cut" })]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "cut" })]);
      mockGamesDb.updateGameStatus.mockResolvedValue(wonGame);
      mockGamesDb.getGameCreatedVia.mockResolvedValue("dev_seed");
      mockPlayersDb.getPlayerProfileIdsByGameId.mockResolvedValue(["prof-1", "prof-2", "prof-3"]);

      await engine.executeSoloCut("g1", "p1", "3");

      expect(mockGamesDb.getGameCreatedVia).toHaveBeenCalledWith("g1");
      expect(mockPlayersDb.getPlayerProfileIdsByGameId).not.toHaveBeenCalled();
      expect(mockOutcomesDb.upsertMissionOutcome).not.toHaveBeenCalled();
    });

    it("records 'won' for every seated profile when a solo cut wins the game", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1", mission: 3, detonatorMax: 4 });
      const wire1 = makeWire({ id: "w1", playerId: "p1", value: "3", color: "blue", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const wonGame = { ...game, status: "won" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWiresByValueAndGame.mockResolvedValue([wire1]);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockWiresDb.updateWireStatus.mockResolvedValue({ ...wire1, status: "cut" });
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "success" });
      mockWiresDb.getWiresByValueColorAndGame.mockResolvedValue([makeWire({ status: "cut" })]);
      mockWiresDb.getWiresByGameId.mockResolvedValue([makeWire({ status: "cut" })]);
      mockGamesDb.updateGameStatus.mockResolvedValue(wonGame);
      mockPlayersDb.getPlayerProfileIdsByGameId.mockResolvedValue(["prof-1", "prof-2", "prof-3"]);

      await engine.executeSoloCut("g1", "p1", "3");

      expect(mockPlayersDb.getPlayerProfileIdsByGameId).toHaveBeenCalledWith("g1");
      expect(mockOutcomesDb.upsertMissionOutcome).toHaveBeenCalledTimes(3);
      expect(mockOutcomesDb.upsertMissionOutcome).toHaveBeenCalledWith("prof-1", 3, "won");
      expect(mockOutcomesDb.upsertMissionOutcome).toHaveBeenCalledWith("prof-2", 3, "won");
      expect(mockOutcomesDb.upsertMissionOutcome).toHaveBeenCalledWith("prof-3", 3, "won");
    });

    it("records 'lost' for every seated profile on a red-wire game over", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1", mission: 2,
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "1",
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "red", value: "1", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const lostGame = { ...game, status: "lost" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(game);
      mockGamesDb.updateGameStatus.mockResolvedValue(lostGame);
      mockPlayersDb.getPlayerProfileIdsByGameId.mockResolvedValue(["prof-1", "prof-2"]);

      await engine.executeRespondDualCut("g1", "p2", false);

      expect(mockOutcomesDb.upsertMissionOutcome).toHaveBeenCalledTimes(2);
      expect(mockOutcomesDb.upsertMissionOutcome).toHaveBeenCalledWith("prof-1", 2, "lost");
      expect(mockOutcomesDb.upsertMissionOutcome).toHaveBeenCalledWith("prof-2", 2, "lost");
    });

    it("records nothing when no seated player has a profile", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1", mission: 1,
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "1",
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "red", value: "1", status: "hidden" });
      const turn = makeTurn({ id: "t1" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(game);
      mockGamesDb.updateGameStatus.mockResolvedValue({ ...game, status: "lost" as const });
      mockPlayersDb.getPlayerProfileIdsByGameId.mockResolvedValue([]);

      await engine.executeRespondDualCut("g1", "p2", false);

      expect(mockOutcomesDb.upsertMissionOutcome).not.toHaveBeenCalled();
    });

    it("records 'lost' when the detonator reaches max on a wrong guess", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1", mission: 4,
        detonatorPosition: 2, detonatorMax: 3,
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "5",
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "blue", value: "3", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const detonatedGame = { ...game, detonatorPosition: 3 };
      const lostGame = { ...detonatedGame, status: "lost" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTokensDb.createInfoToken.mockResolvedValue({ id: "t-info", gameId: "g1", wireId: "w1", value: "3", placedAt: "2026-01-01T00:00:00Z" });
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(game);
      mockGamesDb.updateDetonator.mockResolvedValue(detonatedGame);
      mockGamesDb.updateGameStatus.mockResolvedValue(lostGame);
      mockPlayersDb.getPlayerProfileIdsByGameId.mockResolvedValue(["prof-1"]);

      const result = await engine.executeRespondDualCut("g1", "p2", false);

      expect(result.phase).toBe("game_over");
      expect(mockOutcomesDb.upsertMissionOutcome).toHaveBeenCalledWith("prof-1", 4, "lost");
    });
  });

  describe("advanceTurn", () => {
    it("rotates to the next seat when they have hidden wires left", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const players = [
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockWiresDb.getWiresByGameId.mockResolvedValue([
        makeWire({ playerId: "p2", status: "hidden" }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.advanceTurn("g1");

      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p2");
      expect(result.currentTurnPlayerId).toBe("p2");
    });

    it("skips a single fully-cut player and lands on the next one with hidden wires", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const players = [
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
        makePlayer({ id: "p3", seatOrder: 2 }),
      ];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      // p2 is fully cut, p3 still has a hidden wire
      mockWiresDb.getWiresByGameId.mockResolvedValue([
        makeWire({ playerId: "p2", status: "cut" }),
        makeWire({ playerId: "p3", status: "hidden" }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p3" });

      const result = await engine.advanceTurn("g1");

      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p3");
      expect(result.currentTurnPlayerId).toBe("p3");
    });

    it("skips multiple consecutive fully-cut players", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const players = [
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
        makePlayer({ id: "p3", seatOrder: 2 }),
        makePlayer({ id: "p4", seatOrder: 3 }),
      ];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      // p2 and p3 fully cut, p4 still has a hidden wire
      mockWiresDb.getWiresByGameId.mockResolvedValue([
        makeWire({ playerId: "p2", status: "cut" }),
        makeWire({ playerId: "p3", status: "cut" }),
        makeWire({ playerId: "p4", status: "hidden" }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p4" });

      const result = await engine.advanceTurn("g1");

      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p4");
      expect(result.currentTurnPlayerId).toBe("p4");
    });

    it("near-win: skips every fully-cut player and lands on the one remaining player with wires", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const players = [
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
        makePlayer({ id: "p3", seatOrder: 2 }),
        makePlayer({ id: "p4", seatOrder: 3 }),
      ];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      // p1 (current) still has wires but isn't a rotation candidate; p2-p4 fully
      // cut except p1 itself wraps back around — only p1 has hidden wires left.
      mockWiresDb.getWiresByGameId.mockResolvedValue([
        makeWire({ playerId: "p1", status: "hidden" }),
        makeWire({ playerId: "p2", status: "cut" }),
        makeWire({ playerId: "p3", status: "cut" }),
        makeWire({ playerId: "p4", status: "cut" }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p1" });

      const result = await engine.advanceTurn("g1");

      // Wraps all the way back around to the only player left with hidden wires
      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p1");
      expect(result.currentTurnPlayerId).toBe("p1");
    });

    // #190 Phase B negative path: if the next candidate's ENTIRE remaining
    // hidden hand is red (any numbers), it auto-reveals at turn-start
    // instead of forcing a losing action — no loss, no cut, turn advances
    // past them (same evaluation point as #152's auto-skip).
    it("auto-reveals a candidate's all-red hand at turn-start — no loss, no cut, turn advances past them", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const players = [
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
        makePlayer({ id: "p3", seatOrder: 2 }),
      ];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      // p2's only remaining hidden wires are both red; p3 has a normal hand.
      mockWiresDb.getWiresByGameId.mockResolvedValue([
        makeWire({ playerId: "p2", color: "red", value: "1.5", status: "hidden" }),
        makeWire({ playerId: "p2", color: "red", value: "4.5", status: "hidden" }),
        makeWire({ playerId: "p3", color: "blue", value: "3", status: "hidden" }),
      ]);
      mockWiresDb.revealRedWiresForPlayer.mockResolvedValue([]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p3" });

      const result = await engine.advanceTurn("g1");

      expect(mockWiresDb.revealRedWiresForPlayer).toHaveBeenCalledWith("g1", "p2");
      expect(mockGamesDb.updateDetonator).not.toHaveBeenCalled();
      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p3");
      expect(result.currentTurnPlayerId).toBe("p3");
    });

    it("does NOT auto-reveal a mixed hand (red + non-red) — normal turn proceeds", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const players = [
        makePlayer({ id: "p1", seatOrder: 0 }),
        makePlayer({ id: "p2", seatOrder: 1 }),
      ];
      mockGamesDb.getGameById.mockResolvedValue(game);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockWiresDb.getWiresByGameId.mockResolvedValue([
        makeWire({ playerId: "p2", color: "red", value: "1.5", status: "hidden" }),
        makeWire({ playerId: "p2", color: "blue", value: "3", status: "hidden" }),
      ]);
      mockGamesDb.updateCurrentTurn.mockResolvedValue({ ...game, currentTurnPlayerId: "p2" });

      const result = await engine.advanceTurn("g1");

      expect(mockWiresDb.revealRedWiresForPlayer).not.toHaveBeenCalled();
      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", "p2");
      expect(result.currentTurnPlayerId).toBe("p2");
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
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden", color: "blue", value: "3" });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });
      const ownMatchingWire = makeWire({ id: "w-own", gameId: "g1", playerId: "p1", status: "hidden", color: "blue", value: "3" });
      const updatedGame = { ...game, pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "3" };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([ownMatchingWire]);
      mockPlayersDb.getPlayerById.mockResolvedValue(targetPlayer);
      mockGamesDb.setPendingDualCut.mockResolvedValue(updatedGame);

      const result = await engine.executeProposeDualCut("g1", "p1", "w1", "3");

      expect(mockGamesDb.setPendingDualCut).toHaveBeenCalledWith("g1", "p1", "w1", "3");
      expect(result.game.pendingDualCutWireId).toBe("w1");
      expect(result.wire.id).toBe("w1");
      expect(result.targetPlayer.id).toBe("p2");
    });

    it("sets pending dual cut for a yellow target when the proposer holds a hidden yellow wire", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden", color: "yellow", value: "7" });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });
      const ownYellowWire = makeWire({ id: "w-own", gameId: "g1", playerId: "p1", status: "hidden", color: "yellow", value: "9" });
      const updatedGame = { ...game, pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "7" };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([ownYellowWire]);
      mockPlayersDb.getPlayerById.mockResolvedValue(targetPlayer);
      mockGamesDb.setPendingDualCut.mockResolvedValue(updatedGame);

      const result = await engine.executeProposeDualCut("g1", "p1", "w1", "7");

      expect(mockGamesDb.setPendingDualCut).toHaveBeenCalledWith("g1", "p1", "w1", "7");
      expect(result.game.pendingDualCutWireId).toBe("w1");
    });

    it("rejects a blue-target guess if the proposer doesn't hold a matching hidden wire", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden", color: "blue", value: "3" });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });
      const nonMatchingOwnWire = makeWire({ id: "w-own", gameId: "g1", playerId: "p1", status: "hidden", color: "blue", value: "5" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([nonMatchingOwnWire]);
      mockPlayersDb.getPlayerById.mockResolvedValue(targetPlayer);

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "3")).rejects.toThrow(
        "Must hold a matching wire to propose this guess"
      );
      expect(mockGamesDb.setPendingDualCut).not.toHaveBeenCalled();
    });

    it("rejects a yellow-target guess if the proposer doesn't hold a hidden yellow wire", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden", color: "yellow", value: "7" });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });
      const nonYellowOwnWire = makeWire({ id: "w-own", gameId: "g1", playerId: "p1", status: "hidden", color: "blue", value: "7" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([nonYellowOwnWire]);
      mockPlayersDb.getPlayerById.mockResolvedValue(targetPlayer);

      await expect(engine.executeProposeDualCut("g1", "p1", "w1", "7")).rejects.toThrow(
        "Must hold a yellow wire to propose this guess"
      );
      expect(mockGamesDb.setPendingDualCut).not.toHaveBeenCalled();
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

    it("rejects targeting a fully-cut player's wire (#152 interaction: they have no hidden wires to target)", async () => {
      const game = makeGame({ id: "g1", status: "active", currentTurnPlayerId: "p1" });
      // A player skipped by advanceTurn's auto-skip has zero hidden wires —
      // any wire of theirs the proposer could reference is already 'cut',
      // so this hits the same existing status guard, not new logic.
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
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", status: "hidden", color: "blue", value: "3" });
      const targetPlayer = makePlayer({ id: "p2", gameId: "g1" });
      const ownMatchingWire = makeWire({ id: "w-own", gameId: "g1", playerId: "p1", status: "hidden", color: "blue", value: "3" });

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([ownMatchingWire]);
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

    // #190 Phase B negative path: red is never cut, full stop — an
    // ACCEPTED guess against a hidden red wire must not reveal it toward
    // completion; it's an instant loss just like a rejected one. Without
    // this guard, this branch would have gone straight to updateWireStatus
    // (revealed) and let executeCompleteDualCut cut the red wire.
    it("accepted: true (red wire) is an instant loss, never reveals toward completion (checkRedSave seam, no save available)", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "3.5",
      });
      const wire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "red", value: "3.5", status: "hidden" });
      const turn = makeTurn({ id: "t1" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };
      const lostGame = { ...clearedGame, status: "lost" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValue(wire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockGamesDb.updateGameStatus.mockResolvedValue(lostGame);

      const result = await engine.executeRespondDualCut("g1", "p2", true);

      expect(result.phase).toBe("game_over");
      expect(result.game.status).toBe("lost");
      expect(mockWiresDb.updateWireStatus).not.toHaveBeenCalled();
      expect(mockTokensDb.createInfoToken).not.toHaveBeenCalled();
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

    // #190 Phase B defense-in-depth: should be unreachable in practice
    // (executeRespondDualCut's accept branch already blocks a red target
    // from ever reaching 'revealed'), but a completion step must never be
    // the one place that actually cuts a red wire if that guard is ever
    // bypassed.
    it("target wire is red (defense in depth) — instant loss, never cuts", async () => {
      const game = makeGame({
        id: "g1", status: "active", currentTurnPlayerId: "p1",
        pendingDualCutWireId: "w1", pendingDualCutProposerId: "p1", pendingDualCutGuessedValue: "3.5",
      });
      const targetWire = makeWire({ id: "w1", gameId: "g1", playerId: "p2", color: "red", value: "3.5", status: "revealed" });
      const turn = makeTurn({ id: "t1" });
      const clearedGame = { ...game, pendingDualCutWireId: null, pendingDualCutProposerId: null, pendingDualCutGuessedValue: null };
      const lostGame = { ...clearedGame, status: "lost" as const };

      mockGamesDb.getGameById.mockResolvedValue(game);
      mockWiresDb.getWireById.mockResolvedValueOnce(targetWire);
      mockTurnsDb.createTurn.mockResolvedValue(turn);
      mockTurnsDb.updateTurnResult.mockResolvedValue({ ...turn, result: "fail" });
      mockGamesDb.clearPendingDualCut.mockResolvedValue(clearedGame);
      mockGamesDb.updateGameStatus.mockResolvedValue(lostGame);

      const result = await engine.executeCompleteDualCut("g1", "p1", "w2");

      expect(result.game.status).toBe("lost");
      expect(result.turn.result).toBe("fail");
      expect(mockWiresDb.updateWireStatus).not.toHaveBeenCalled();
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
