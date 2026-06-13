import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeProfile, makeGame, makePlayer, resetIds } from "./fixtures.js";

vi.mock("../src/db/profiles.js", () => ({
  getProfileByName: vi.fn(),
  getProfileById: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

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
  getActivePlayerByProfileId: vi.fn(),
  markDoubleDetectorUsed: vi.fn(),
}));

vi.mock("../src/db/tokens.js", () => ({
  createInfoToken: vi.fn(),
  getInfoTokensByGameId: vi.fn(),
  createValidationToken: vi.fn(),
  getValidationTokensByGameId: vi.fn(),
}));

vi.mock("../src/db/wires.js", () => ({
  getWiresByPlayerId: vi.fn(),
  getWiresByGameId: vi.fn(),
  createWire: vi.fn(),
  createWiresBatch: vi.fn(),
  getWireById: vi.fn(),
  updateWireStatus: vi.fn(),
  getWiresByValueAndGame: vi.fn(),
  getWiresByValueColorAndGame: vi.fn(),
  revealRedWires: vi.fn(),
}));

vi.mock("../src/ws/connection-manager.js", () => ({
  registerConnection: vi.fn(),
  getConnectionInfo: vi.fn(),
  getGameSockets: vi.fn(),
  broadcastToGame: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  setAuthenticatedUser: vi.fn(),
  removeConnection: vi.fn(),
}));

vi.mock("../src/ws/auth.js", () => ({
  authenticateUpgrade: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/ws/message-handler.js", () => ({
  handleMessage: vi.fn(),
}));

vi.mock("../src/ws/state-broadcaster.js", () => ({
  broadcastGameState: vi.fn(),
  buildPlayerView: vi.fn((wires) => wires),
}));

vi.mock("../src/engine/game-engine.js", () => ({
  createGame: vi.fn(),
  startGame: vi.fn(),
  joinGame: vi.fn(),
  completeSetup: vi.fn(),
  executeProposeDualCut: vi.fn(),
  executeRespondDualCut: vi.fn(),
  executeCompleteDualCut: vi.fn(),
  executeSoloCut: vi.fn(),
  executeDoubleDetector: vi.fn(),
  executeRevealReds: vi.fn(),
  advanceTurn: vi.fn(),
}));

import * as profilesDb from "../src/db/profiles.js";
import * as playersDb from "../src/db/players.js";
import * as wiresDb from "../src/db/wires.js";
import * as gamesDb from "../src/db/games.js";
import * as engine from "../src/engine/game-engine.js";
import { buildApp } from "../src/app.js";

const mockProfilesDb = vi.mocked(profilesDb);
const mockPlayersDb = vi.mocked(playersDb);
const mockWiresDb = vi.mocked(wiresDb);
const mockGamesDb = vi.mocked(gamesDb);
const mockEngine = vi.mocked(engine);

describe("routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetIds();
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    });
  });

  describe("GET /healthz", () => {
    it("returns 200 with status ok", async () => {
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    });
  });

  describe("POST /profiles", () => {
    it("creates a new profile and returns 201", async () => {
      const profile = makeProfile({ id: "prof-1", name: "Alice" });
      mockProfilesDb.getProfileByName.mockResolvedValue(null);
      mockProfilesDb.createProfile.mockResolvedValue(profile);

      const res = await app.inject({
        method: "POST",
        url: "/profiles",
        payload: { name: "Alice" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ profile });
      expect(mockProfilesDb.createProfile).toHaveBeenCalledWith("Alice");
    });

    it("returns existing profile (upsert) with 200", async () => {
      const profile = makeProfile({ id: "prof-1", name: "Alice" });
      mockProfilesDb.getProfileByName.mockResolvedValue(profile);

      const res = await app.inject({
        method: "POST",
        url: "/profiles",
        payload: { name: "Alice" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ profile });
      expect(mockProfilesDb.createProfile).not.toHaveBeenCalled();
    });

    it("returns 400 when name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/profiles",
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when name is empty string", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/profiles",
        payload: { name: "   " },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when name exceeds 20 chars", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/profiles",
        payload: { name: "A".repeat(21) },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 500 on DB error", async () => {
      mockProfilesDb.getProfileByName.mockRejectedValue(new Error("DB down"));

      const res = await app.inject({
        method: "POST",
        url: "/profiles",
        payload: { name: "Alice" },
      });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal server error" });
    });
  });

  describe("POST /dev/seed", () => {
    let seedApp: FastifyInstance;

    beforeEach(async () => {
      process.env.ENABLE_DEV_SEED = "true";
      seedApp = await buildApp();
    });

    afterEach(async () => {
      await seedApp.close();
      delete process.env.ENABLE_DEV_SEED;
    });

    it("creates a 4-player seeded game and returns joinCode + profileId", async () => {
      const profile = makeProfile({ id: "prof-dev", name: "Dev" });
      const game = makeGame({ id: "g1", joinCode: "DEVGAME" });
      const player = makePlayer({ id: "p1", gameId: "g1" });
      const startedGame = { ...game, status: "setup" as const };
      const activeGame = { ...game, status: "active" as const };
      const mockPlayers = [player, makePlayer({ id: "p2" }), makePlayer({ id: "p3" }), makePlayer({ id: "p4" })];

      mockProfilesDb.getProfileByName.mockResolvedValue(null);
      mockProfilesDb.createProfile.mockResolvedValue(profile);
      mockEngine.createGame.mockResolvedValue({ game, player });
      mockEngine.joinGame.mockResolvedValue({ game, player: mockPlayers[1], players: mockPlayers.slice(0, 2) });
      mockEngine.startGame.mockResolvedValue({ game: startedGame, players: mockPlayers, wires: [] });
      mockEngine.completeSetup.mockResolvedValue(activeGame);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(mockPlayers);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([]);

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ joinCode: "DEVGAME", profileId: "prof-dev", playerName: "Dev", mission: 1 });
      expect(mockEngine.createGame).toHaveBeenCalledWith("Dev", "prof-dev");
      expect(mockEngine.joinGame).toHaveBeenCalledTimes(3);
      expect(mockEngine.joinGame).toHaveBeenCalledWith("DEVGAME", "Alice");
      expect(mockEngine.joinGame).toHaveBeenCalledWith("DEVGAME", "Bob");
      expect(mockEngine.joinGame).toHaveBeenCalledWith("DEVGAME", "Carol");
      expect(mockEngine.startGame).toHaveBeenCalledWith("g1", "p1", 1);
      expect(mockEngine.completeSetup).toHaveBeenCalledWith("g1");
    });

    it("accepts a mission param and seeds that mission", async () => {
      const profile = makeProfile({ id: "prof-dev", name: "Dev" });
      const game = makeGame({ id: "g1", joinCode: "DEVGAME" });
      const player = makePlayer({ id: "p1", gameId: "g1" });
      const startedGame = { ...game, status: "setup" as const };
      const activeGame = { ...game, status: "active" as const };

      mockProfilesDb.getProfileByName.mockResolvedValue(null);
      mockProfilesDb.createProfile.mockResolvedValue(profile);
      mockEngine.createGame.mockResolvedValue({ game, player });
      mockEngine.joinGame.mockResolvedValue({ game, player, players: [player] });
      mockEngine.startGame.mockResolvedValue({ game: startedGame, players: [player], wires: [] });
      mockEngine.completeSetup.mockResolvedValue(activeGame);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([player]);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([]);

      const res = await seedApp.inject({
        method: "POST", url: "/dev/seed",
        payload: { mission: 5 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ mission: 5 });
      expect(mockEngine.startGame).toHaveBeenCalledWith("g1", "p1", 5);
    });

    it.each([
      { mission: 0, label: "below range" },
      { mission: 9, label: "above range" },
      { mission: 1.5, label: "non-integer" },
      { mission: "five", label: "non-number" },
    ])("returns 400 for invalid mission ($label)", async ({ mission }) => {
      const res = await seedApp.inject({
        method: "POST", url: "/dev/seed",
        payload: { mission },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "mission must be an integer between 1 and 8" });
    });

    it("reuses existing Dev profile", async () => {
      const profile = makeProfile({ id: "prof-dev", name: "Dev" });
      const game = makeGame({ id: "g1", joinCode: "DEVGAME" });
      const player = makePlayer({ id: "p1", gameId: "g1" });
      const startedGame = { ...game, status: "setup" as const };
      const activeGame = { ...game, status: "active" as const };

      mockProfilesDb.getProfileByName.mockResolvedValue(profile);
      mockEngine.createGame.mockResolvedValue({ game, player });
      mockEngine.joinGame.mockResolvedValue({ game, player, players: [player] });
      mockEngine.startGame.mockResolvedValue({ game: startedGame, players: [player], wires: [] });
      mockEngine.completeSetup.mockResolvedValue(activeGame);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([player]);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([]);

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed" });

      expect(res.statusCode).toBe(200);
      expect(mockProfilesDb.createProfile).not.toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      mockProfilesDb.getProfileByName.mockRejectedValue(new Error("DB down"));

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed" });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Seed failed" });
    });
  });

  describe("POST /dev/advance-turn", () => {
    let devApp: FastifyInstance;

    beforeEach(async () => {
      process.env.ENABLE_DEV_SEED = "true";
      devApp = await buildApp();
    });

    afterEach(async () => {
      await devApp.close();
      delete process.env.ENABLE_DEV_SEED;
    });

    it("advances the turn and returns currentTurnPlayerId and playerName", async () => {
      const game = makeGame({ id: "g1", joinCode: "ABCD", status: "active", currentTurnPlayerId: "p1" });
      const updatedGame = { ...game, currentTurnPlayerId: "p2" };
      const players = [
        makePlayer({ id: "p1", name: "Alice", gameId: "g1" }),
        makePlayer({ id: "p2", name: "Bob", gameId: "g1" }),
      ];

      mockGamesDb.getGameByJoinCode.mockResolvedValue(game);
      mockEngine.advanceTurn.mockResolvedValue(updatedGame);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      const res = await devApp.inject({
        method: "POST",
        url: "/dev/advance-turn",
        payload: { joinCode: "ABCD" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ currentTurnPlayerId: "p2", playerName: "Bob" });
      expect(mockEngine.advanceTurn).toHaveBeenCalledWith("g1");
    });

    it("returns 404 when game is not found", async () => {
      mockGamesDb.getGameByJoinCode.mockResolvedValue(null);

      const res = await devApp.inject({
        method: "POST",
        url: "/dev/advance-turn",
        payload: { joinCode: "XXXX" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Game not found" });
    });

    it("returns 400 when game is not active", async () => {
      const game = makeGame({ id: "g1", joinCode: "ABCD", status: "setup" });
      mockGamesDb.getGameByJoinCode.mockResolvedValue(game);

      const res = await devApp.inject({
        method: "POST",
        url: "/dev/advance-turn",
        payload: { joinCode: "ABCD" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "Game is not active" });
    });

    it("returns 400 when joinCode is missing", async () => {
      const res = await devApp.inject({
        method: "POST",
        url: "/dev/advance-turn",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "joinCode is required" });
    });

    it("returns 500 on unexpected error", async () => {
      mockGamesDb.getGameByJoinCode.mockRejectedValue(new Error("DB down"));

      const res = await devApp.inject({
        method: "POST",
        url: "/dev/advance-turn",
        payload: { joinCode: "ABCD" },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Failed to advance turn" });
    });
  });
});
