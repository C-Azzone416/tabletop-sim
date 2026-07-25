import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeProfile, makeGame, makePlayer, makeWire, resetIds } from "./fixtures.js";

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
  deleteGame: vi.fn(),
}));

vi.mock("../src/db/players.js", () => ({
  createPlayer: vi.fn(),
  getPlayersByGameId: vi.fn(),
  getPlayerProfileIdsByGameId: vi.fn(),
  getPlayerById: vi.fn(),
  getActivePlayerByProfileId: vi.fn(),
  markDoubleDetectorUsed: vi.fn(),
}));

vi.mock("../src/db/tokens.js", () => ({
  createInfoToken: vi.fn(),
  deleteDevInfoTokensByGameId: vi.fn(),
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
  updateWirePlayer: vi.fn(),
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
  authenticateProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/ws/message-handler.js", () => ({
  handleMessage: vi.fn(),
}));

vi.mock("../src/ws/state-broadcaster.js", () => ({
  broadcastGameState: vi.fn(),
  buildPlayerView: vi.fn((wires) => wires),
}));

vi.mock("../src/db/migrations.js", () => ({
  getMigrationsStatus: vi.fn(),
}));

vi.mock("../src/db/outcomes.js", () => ({
  upsertMissionOutcome: vi.fn(),
  getMissionOutcomesByProfileId: vi.fn(),
}));

vi.mock("../src/engine/game-engine.js", () => ({
  createGame: vi.fn(),
  startGame: vi.fn(),
  joinGame: vi.fn(),
  executePlayerReady: vi.fn(),
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
import * as tokensDb from "../src/db/tokens.js";
import * as engine from "../src/engine/game-engine.js";
import * as stateBroadcaster from "../src/ws/state-broadcaster.js";
import * as migrationsDb from "../src/db/migrations.js";
import * as outcomesDb from "../src/db/outcomes.js";
import * as wsAuth from "../src/ws/auth.js";
import { buildApp } from "../src/app.js";

const mockProfilesDb = vi.mocked(profilesDb);
const mockPlayersDb = vi.mocked(playersDb);
const mockWiresDb = vi.mocked(wiresDb);
const mockGamesDb = vi.mocked(gamesDb);
const mockTokensDb = vi.mocked(tokensDb);
const mockEngine = vi.mocked(engine);
const mockStateBroadcaster = vi.mocked(stateBroadcaster);
const mockMigrationsDb = vi.mocked(migrationsDb);
const mockWsAuth = vi.mocked(wsAuth);

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

  describe("GET /profiles/:id/mission-outcomes", () => {
    const mockOutcomesDb = vi.mocked(outcomesDb);

    // #222 — own-profile only, same #194 pattern as GET /profiles/:id below:
    // this route composed with a known profileId into a full mission-history
    // leak with no auth check at all.
    it("returns the profile's outcomes ordered by mission when the caller authenticates as that profile", async () => {
      const profile = makeProfile({ id: "prof-1", name: "Alice" });
      const outcomes = [
        { profileId: "prof-1", mission: 1, outcome: "won" as const, updatedAt: "2026-07-24T00:00:00Z" },
        { profileId: "prof-1", mission: 2, outcome: "lost" as const, updatedAt: "2026-07-24T00:00:00Z" },
      ];
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-1", name: "Alice" });
      mockProfilesDb.getProfileById.mockResolvedValue(profile);
      mockOutcomesDb.getMissionOutcomesByProfileId.mockResolvedValue(outcomes);

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1/mission-outcomes?profileId=prof-1&name=Alice" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ outcomes });
      expect(mockOutcomesDb.getMissionOutcomesByProfileId).toHaveBeenCalledWith("prof-1");
    });

    it("returns an empty array for a profile with no recorded outcomes", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-1", name: "Alice" });
      mockProfilesDb.getProfileById.mockResolvedValue(makeProfile({ id: "prof-1" }));
      mockOutcomesDb.getMissionOutcomesByProfileId.mockResolvedValue([]);

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1/mission-outcomes?profileId=prof-1&name=Alice" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ outcomes: [] });
    });

    it("returns 401 when no auth credential is presented", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1/mission-outcomes" });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Authentication required" });
      expect(mockProfilesDb.getProfileById).not.toHaveBeenCalled();
      expect(mockOutcomesDb.getMissionOutcomesByProfileId).not.toHaveBeenCalled();
    });

    it("returns 403 when the caller authenticates as a different profile", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-2", name: "Bob" });

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1/mission-outcomes?profileId=prof-2&name=Bob" });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "Forbidden" });
      expect(mockProfilesDb.getProfileById).not.toHaveBeenCalled();
      expect(mockOutcomesDb.getMissionOutcomesByProfileId).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown profile", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "nope", name: "Ghost" });
      mockProfilesDb.getProfileById.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: "/profiles/nope/mission-outcomes?profileId=nope&name=Ghost" });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Profile not found" });
    });

    it("returns 500 on DB error", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-1", name: "Alice" });
      mockProfilesDb.getProfileById.mockResolvedValue(makeProfile({ id: "prof-1" }));
      mockOutcomesDb.getMissionOutcomesByProfileId.mockRejectedValue(new Error("DB down"));

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1/mission-outcomes?profileId=prof-1&name=Alice" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal server error" });
    });
  });

  describe("GET /profiles/:id", () => {
    it("returns the profile when the caller authenticates as that profile", async () => {
      const profile = makeProfile({ id: "prof-1", name: "Alice" });
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-1", name: "Alice" });
      mockProfilesDb.getProfileById.mockResolvedValue(profile);

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1?profileId=prof-1&name=Alice" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ profile });
      expect(mockProfilesDb.getProfileById).toHaveBeenCalledWith("prof-1");
      expect(mockWsAuth.authenticateProfile).toHaveBeenCalledWith("prof-1", "Alice");
    });

    it("returns 401 when no auth credential is presented", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1" });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Authentication required" });
      expect(mockProfilesDb.getProfileById).not.toHaveBeenCalled();
    });

    it("returns 403 when the caller authenticates as a different profile", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-2", name: "Bob" });

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1?profileId=prof-2&name=Bob" });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "Forbidden" });
      expect(mockProfilesDb.getProfileById).not.toHaveBeenCalled();
    });

    it("returns 404 when the profile does not exist", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "nonexistent", name: "Ghost" });
      mockProfilesDb.getProfileById.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: "/profiles/nonexistent?profileId=nonexistent&name=Ghost" });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Profile not found" });
    });

    it("returns 500 on DB error", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-1", name: "Alice" });
      mockProfilesDb.getProfileById.mockRejectedValue(new Error("DB down"));

      const res = await app.inject({ method: "GET", url: "/profiles/prof-1?profileId=prof-1&name=Alice" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal server error" });
    });
  });

  describe("GET /games/:joinCode", () => {
    it("returns the game and its players when the caller is a seated player", async () => {
      const game = makeGame({ id: "g1", joinCode: "ABCD" });
      const players = [makePlayer({ id: "p1", gameId: "g1" }), makePlayer({ id: "p2", gameId: "g1" })];
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-1", name: "Alice" });
      mockGamesDb.getGameByJoinCode.mockResolvedValue(game);
      mockPlayersDb.getPlayerProfileIdsByGameId.mockResolvedValue(["prof-1", "prof-2"]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      const res = await app.inject({ method: "GET", url: "/games/ABCD?profileId=prof-1&name=Alice" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ game, players });
      expect(mockPlayersDb.getPlayersByGameId).toHaveBeenCalledWith("g1");
    });

    it("returns 401 when no auth credential is presented", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: "/games/ABCD" });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Authentication required" });
      expect(mockGamesDb.getGameByJoinCode).not.toHaveBeenCalled();
    });

    it("returns 403 when the caller is authenticated but not seated in this game", async () => {
      const game = makeGame({ id: "g1", joinCode: "ABCD" });
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-3", name: "Mallory" });
      mockGamesDb.getGameByJoinCode.mockResolvedValue(game);
      mockPlayersDb.getPlayerProfileIdsByGameId.mockResolvedValue(["prof-1", "prof-2"]);

      const res = await app.inject({ method: "GET", url: "/games/ABCD?profileId=prof-3&name=Mallory" });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "Forbidden" });
      expect(mockPlayersDb.getPlayersByGameId).not.toHaveBeenCalled();
    });

    it("returns 404 when the game does not exist", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-1", name: "Alice" });
      mockGamesDb.getGameByJoinCode.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: "/games/XXXX?profileId=prof-1&name=Alice" });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Game not found" });
    });

    it("returns 500 on DB error", async () => {
      mockWsAuth.authenticateProfile.mockResolvedValue({ profileId: "prof-1", name: "Alice" });
      mockGamesDb.getGameByJoinCode.mockRejectedValue(new Error("DB down"));

      const res = await app.inject({ method: "GET", url: "/games/ABCD?profileId=prof-1&name=Alice" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal server error" });
    });
  });

  describe("POST /games", () => {
    it("returns 400 when playerName is missing", async () => {
      const res = await app.inject({ method: "POST", url: "/games", payload: {} });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "playerName is required" });
    });

    it("returns 501 (unimplemented, use WebSocket) when playerName is present", async () => {
      const res = await app.inject({ method: "POST", url: "/games", payload: { playerName: "Alice" } });

      expect(res.statusCode).toBe(501);
      expect(res.json()).toEqual({ error: "Use WebSocket to create games" });
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

    it("creates a 4-player seeded game left in setup status, without completing setup (real opening flow)", async () => {
      const game = makeGame({ id: "g1", joinCode: "DEVGAME" });
      const player = makePlayer({ id: "p1", gameId: "g1" });
      const startedGame = { ...game, status: "setup" as const };
      const mockPlayers = [player, makePlayer({ id: "p2" }), makePlayer({ id: "p3" }), makePlayer({ id: "p4" })];

      mockProfilesDb.getProfileByName.mockResolvedValue(null);
      mockProfilesDb.createProfile.mockImplementation(async (name: string) =>
        makeProfile({ id: `prof-${name.toLowerCase()}`, name }));
      mockEngine.createGame.mockResolvedValue({ game, player });
      mockEngine.joinGame.mockResolvedValue({ game, player: mockPlayers[1], players: mockPlayers.slice(0, 2) });
      mockEngine.startGame.mockResolvedValue({ game: startedGame, players: mockPlayers, wires: [] });

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        joinCode: "DEVGAME",
        profileId: "prof-dev",
        playerName: "Dev",
        mission: 1,
        players: [
          { name: "Dev", profileId: "prof-dev" },
          { name: "Alice", profileId: "prof-alice" },
          { name: "Bob", profileId: "prof-bob" },
          { name: "Carol", profileId: "prof-carol" },
        ],
      });
      expect(mockEngine.createGame).toHaveBeenCalledWith("Dev", "prof-dev", "dev_seed");
      expect(mockEngine.joinGame).toHaveBeenCalledTimes(3);
      expect(mockEngine.joinGame).toHaveBeenCalledWith("DEVGAME", "Alice", "prof-alice");
      expect(mockEngine.joinGame).toHaveBeenCalledWith("DEVGAME", "Bob", "prof-bob");
      expect(mockEngine.joinGame).toHaveBeenCalledWith("DEVGAME", "Carol", "prof-carol");
      expect(mockEngine.startGame).toHaveBeenCalledWith("g1", "p1", 1);
      expect(mockEngine.completeSetup).not.toHaveBeenCalled();
      expect(mockPlayersDb.getPlayersByGameId).not.toHaveBeenCalled();
      expect(mockWiresDb.getWiresByPlayerId).not.toHaveBeenCalled();
    });

    it("accepts a mission param and seeds that mission", async () => {
      const game = makeGame({ id: "g1", joinCode: "DEVGAME" });
      const player = makePlayer({ id: "p1", gameId: "g1" });
      const startedGame = { ...game, status: "setup" as const };

      mockProfilesDb.getProfileByName.mockResolvedValue(null);
      mockProfilesDb.createProfile.mockImplementation(async (name: string) =>
        makeProfile({ id: `prof-${name.toLowerCase()}`, name }));
      mockEngine.createGame.mockResolvedValue({ game, player });
      mockEngine.joinGame.mockResolvedValue({ game, player, players: [player] });
      mockEngine.startGame.mockResolvedValue({ game: startedGame, players: [player], wires: [] });

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

    it("reuses existing profiles by name instead of creating duplicates", async () => {
      const game = makeGame({ id: "g1", joinCode: "DEVGAME" });
      const player = makePlayer({ id: "p1", gameId: "g1" });
      const startedGame = { ...game, status: "setup" as const };

      mockProfilesDb.getProfileByName.mockImplementation(async (name: string) =>
        makeProfile({ id: `prof-${name.toLowerCase()}`, name }));
      mockEngine.createGame.mockResolvedValue({ game, player });
      mockEngine.joinGame.mockResolvedValue({ game, player, players: [player] });
      mockEngine.startGame.mockResolvedValue({ game: startedGame, players: [player], wires: [] });

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

  describe("POST /dev/reveal-all-tokens", () => {
    let seedApp: FastifyInstance;

    beforeEach(async () => {
      process.env.ENABLE_DEV_SEED = "true";
      seedApp = await buildApp();
    });

    afterEach(async () => {
      await seedApp.close();
      delete process.env.ENABLE_DEV_SEED;
    });

    it("completes setup and backfills a token for every tokenless wire on a 'setup' game", async () => {
      const setupGame = makeGame({ id: "g1", joinCode: "DEVGAME", status: "setup" });
      const activeGame = { ...setupGame, status: "active" as const };
      const players = [makePlayer({ id: "p1", gameId: "g1" }), makePlayer({ id: "p2", gameId: "g1" })];
      const wireWithToken = makeWire({ id: "w1", gameId: "g1", value: "3", status: "hidden" });
      const wireWithoutToken = makeWire({ id: "w2", gameId: "g1", value: "5", status: "hidden" });

      mockGamesDb.getGameByJoinCode.mockResolvedValue(setupGame);
      mockEngine.completeSetup.mockResolvedValue(activeGame);
      mockWiresDb.getWiresByGameId.mockResolvedValue([wireWithToken, wireWithoutToken]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([
        { id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "2026-01-01T00:00:00Z" },
      ]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);
      mockTokensDb.createInfoToken.mockResolvedValue({ id: "t2", gameId: "g1", wireId: "w2", value: "5", placedAt: "2026-01-01T00:00:00Z" });

      const res = await seedApp.inject({ method: "POST", url: "/dev/reveal-all-tokens", payload: { joinCode: "DEVGAME" } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ joinCode: "DEVGAME", tokensCreated: 1, game: activeGame });
      expect(mockEngine.completeSetup).toHaveBeenCalledWith("g1");
      expect(mockTokensDb.createInfoToken).toHaveBeenCalledTimes(1);
      expect(mockTokensDb.createInfoToken).toHaveBeenCalledWith("g1", "w2", "5", true);
      expect(mockStateBroadcaster.broadcastGameState).toHaveBeenCalledWith("g1", activeGame, players);
    });

    it("skips completeSetup for a game already 'active', still backfilling missing tokens", async () => {
      const activeGame = makeGame({ id: "g1", joinCode: "DEVGAME", status: "active" });
      const wireWithoutToken = makeWire({ id: "w1", gameId: "g1", value: "2", status: "hidden" });

      mockGamesDb.getGameByJoinCode.mockResolvedValue(activeGame);
      mockWiresDb.getWiresByGameId.mockResolvedValue([wireWithoutToken]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([]);
      mockTokensDb.createInfoToken.mockResolvedValue({ id: "t1", gameId: "g1", wireId: "w1", value: "2", placedAt: "2026-01-01T00:00:00Z" });

      const res = await seedApp.inject({ method: "POST", url: "/dev/reveal-all-tokens", payload: { joinCode: "DEVGAME" } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ tokensCreated: 1 });
      expect(mockEngine.completeSetup).not.toHaveBeenCalled();
    });

    it("skips wires that are already cut/revealed with no value to token", async () => {
      const activeGame = makeGame({ id: "g1", joinCode: "DEVGAME", status: "active" });
      const cutWire = makeWire({ id: "w1", gameId: "g1", value: null as unknown as string, status: "cut" });

      mockGamesDb.getGameByJoinCode.mockResolvedValue(activeGame);
      mockWiresDb.getWiresByGameId.mockResolvedValue([cutWire]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([]);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([]);

      const res = await seedApp.inject({ method: "POST", url: "/dev/reveal-all-tokens", payload: { joinCode: "DEVGAME" } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ tokensCreated: 0 });
      expect(mockTokensDb.createInfoToken).not.toHaveBeenCalled();
    });

    it("returns 400 when joinCode is missing", async () => {
      const res = await seedApp.inject({ method: "POST", url: "/dev/reveal-all-tokens", payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "joinCode is required" });
    });

    it("returns 404 when the game does not exist", async () => {
      mockGamesDb.getGameByJoinCode.mockResolvedValue(null);
      const res = await seedApp.inject({ method: "POST", url: "/dev/reveal-all-tokens", payload: { joinCode: "NOPE" } });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Game not found" });
    });

    it.each(["waiting", "won", "lost"] as const)("returns 400 for a game in '%s' status", async (status) => {
      mockGamesDb.getGameByJoinCode.mockResolvedValue(makeGame({ id: "g1", joinCode: "DEVGAME", status }));
      const res = await seedApp.inject({ method: "POST", url: "/dev/reveal-all-tokens", payload: { joinCode: "DEVGAME" } });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: `Cannot reveal tokens for a game in '${status}' status` });
    });

    it("returns 500 on error", async () => {
      mockGamesDb.getGameByJoinCode.mockRejectedValue(new Error("DB down"));
      const res = await seedApp.inject({ method: "POST", url: "/dev/reveal-all-tokens", payload: { joinCode: "DEVGAME" } });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Reveal failed" });
    });
  });

  describe("POST /dev/hide-dev-tokens", () => {
    let seedApp: FastifyInstance;

    beforeEach(async () => {
      process.env.ENABLE_DEV_SEED = "true";
      seedApp = await buildApp();
    });

    afterEach(async () => {
      await seedApp.close();
      delete process.env.ENABLE_DEV_SEED;
    });

    it("removes only dev-created tokens and broadcasts the updated state", async () => {
      const activeGame = makeGame({ id: "g1", joinCode: "DEVGAME", status: "active" });
      const players = [makePlayer({ id: "p1", gameId: "g1" }), makePlayer({ id: "p2", gameId: "g1" })];

      mockGamesDb.getGameByJoinCode.mockResolvedValue(activeGame);
      mockTokensDb.deleteDevInfoTokensByGameId.mockResolvedValue(3);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      const res = await seedApp.inject({ method: "POST", url: "/dev/hide-dev-tokens", payload: { joinCode: "DEVGAME" } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ joinCode: "DEVGAME", tokensRemoved: 3, game: activeGame });
      expect(mockTokensDb.deleteDevInfoTokensByGameId).toHaveBeenCalledWith("g1");
      expect(mockStateBroadcaster.broadcastGameState).toHaveBeenCalledWith("g1", activeGame, players);
    });

    it("succeeds with tokensRemoved: 0 when no dev-created tokens exist (gameplay tokens survive)", async () => {
      const activeGame = makeGame({ id: "g1", joinCode: "DEVGAME", status: "active" });

      mockGamesDb.getGameByJoinCode.mockResolvedValue(activeGame);
      mockTokensDb.deleteDevInfoTokensByGameId.mockResolvedValue(0);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([]);

      const res = await seedApp.inject({ method: "POST", url: "/dev/hide-dev-tokens", payload: { joinCode: "DEVGAME" } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ tokensRemoved: 0 });
    });

    it("works on a 'setup' game without touching setup completion", async () => {
      const setupGame = makeGame({ id: "g1", joinCode: "DEVGAME", status: "setup" });

      mockGamesDb.getGameByJoinCode.mockResolvedValue(setupGame);
      mockTokensDb.deleteDevInfoTokensByGameId.mockResolvedValue(1);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue([]);

      const res = await seedApp.inject({ method: "POST", url: "/dev/hide-dev-tokens", payload: { joinCode: "DEVGAME" } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ tokensRemoved: 1 });
      expect(mockEngine.completeSetup).not.toHaveBeenCalled();
    });

    it("returns 400 when joinCode is missing", async () => {
      const res = await seedApp.inject({ method: "POST", url: "/dev/hide-dev-tokens", payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "joinCode is required" });
    });

    it("returns 404 when the game does not exist", async () => {
      mockGamesDb.getGameByJoinCode.mockResolvedValue(null);
      const res = await seedApp.inject({ method: "POST", url: "/dev/hide-dev-tokens", payload: { joinCode: "NOPE" } });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Game not found" });
    });

    it.each(["waiting", "won", "lost"] as const)("returns 400 for a game in '%s' status", async (status) => {
      mockGamesDb.getGameByJoinCode.mockResolvedValue(makeGame({ id: "g1", joinCode: "DEVGAME", status }));
      const res = await seedApp.inject({ method: "POST", url: "/dev/hide-dev-tokens", payload: { joinCode: "DEVGAME" } });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: `Cannot hide tokens for a game in '${status}' status` });
    });

    it("returns 500 on error", async () => {
      mockGamesDb.getGameByJoinCode.mockRejectedValue(new Error("DB down"));
      const res = await seedApp.inject({ method: "POST", url: "/dev/hide-dev-tokens", payload: { joinCode: "DEVGAME" } });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Hide failed" });
    });
  });

  describe("POST /dev/seed-near-win", () => {
    let seedApp: FastifyInstance;

    beforeEach(async () => {
      process.env.ENABLE_DEV_SEED = "true";
      seedApp = await buildApp();
    });

    afterEach(async () => {
      await seedApp.close();
      delete process.env.ENABLE_DEV_SEED;
    });

    function setUpSeedMocks() {
      const game = makeGame({ id: "g1", joinCode: "DEVGAME" });
      const devPlayer = makePlayer({ id: "p1", gameId: "g1", name: "Dev" });
      const alicePlayer = makePlayer({ id: "p2", gameId: "g1", name: "Alice" });
      const startedGame = { ...game, status: "setup" as const };
      const activeGame = { ...game, status: "active" as const };
      const players = [devPlayer, alicePlayer];

      mockProfilesDb.getProfileByName.mockResolvedValue(null);
      mockProfilesDb.createProfile.mockImplementation(async (name: string) =>
        makeProfile({ id: `prof-${name.toLowerCase()}`, name }));
      mockEngine.createGame.mockResolvedValue({ game, player: devPlayer });
      mockEngine.joinGame.mockResolvedValue({ game, player: alicePlayer, players });
      mockEngine.startGame.mockResolvedValue({ game: startedGame, players, wires: [] });
      mockEngine.completeSetup.mockResolvedValue(activeGame);
      mockGamesDb.getGameByJoinCode.mockResolvedValue(activeGame);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      return { game: activeGame, devPlayer, alicePlayer };
    }

    it("reassigns a matching non-red wire pair to Dev, cuts everything else, and hands Dev the turn", async () => {
      const { devPlayer } = setUpSeedMocks();

      // Two blue "1"s split across Dev and Alice (the pair to reassign), plus
      // one red and one other-value wire that must be cut, not touched.
      const pairA = makeWire({ id: "w1", playerId: "p1", color: "blue", value: "1", status: "hidden" });
      const pairB = makeWire({ id: "w2", playerId: "p2", color: "blue", value: "1", status: "hidden" });
      const redWire = makeWire({ id: "w3", playerId: "p1", color: "red", value: "2", status: "hidden" });
      const otherWire = makeWire({ id: "w4", playerId: "p2", color: "blue", value: "3", status: "hidden" });
      mockWiresDb.getWiresByGameId.mockResolvedValue([pairA, pairB, redWire, otherWire]);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([pairA]); // Dev's current wires, for rack-position calc
      mockWiresDb.updateWirePlayer.mockImplementation(async (id, playerId, rackPosition) =>
        makeWire({ id, playerId, color: "blue", value: "1", rackPosition, status: "hidden" }));
      mockWiresDb.updateWireStatus.mockImplementation(async (id, status) => makeWire({ id, status }));

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed-near-win" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ joinCode: "DEVGAME", nearWinValue: "1", nearWinColor: "blue" });

      // Both members of the pair reassigned to Dev, never the red wire.
      expect(mockWiresDb.updateWirePlayer).toHaveBeenCalledTimes(2);
      expect(mockWiresDb.updateWirePlayer).toHaveBeenCalledWith("w1", "p1", expect.any(Number));
      expect(mockWiresDb.updateWirePlayer).toHaveBeenCalledWith("w2", "p1", expect.any(Number));

      // Every other hidden wire cut, the pair itself never cut.
      expect(mockWiresDb.updateWireStatus).toHaveBeenCalledTimes(2);
      expect(mockWiresDb.updateWireStatus).toHaveBeenCalledWith("w3", "cut");
      expect(mockWiresDb.updateWireStatus).toHaveBeenCalledWith("w4", "cut");
      expect(mockWiresDb.updateWireStatus).not.toHaveBeenCalledWith("w1", expect.anything());
      expect(mockWiresDb.updateWireStatus).not.toHaveBeenCalledWith("w2", expect.anything());

      expect(mockGamesDb.updateCurrentTurn).toHaveBeenCalledWith("g1", devPlayer.id);
    });

    it("returns the same player/profileId response shape as /dev/seed, plus the near-win fields", async () => {
      setUpSeedMocks();
      const pairA = makeWire({ id: "w1", playerId: "p1", color: "blue", value: "4", status: "hidden" });
      const pairB = makeWire({ id: "w2", playerId: "p2", color: "blue", value: "4", status: "hidden" });
      mockWiresDb.getWiresByGameId.mockResolvedValue([pairA, pairB]);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([]);
      mockWiresDb.updateWirePlayer.mockImplementation(async (id, playerId, rackPosition) =>
        makeWire({ id, playerId, color: "blue", value: "4", rackPosition, status: "hidden" }));

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed-near-win" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        joinCode: "DEVGAME",
        profileId: "prof-dev",
        playerName: "Dev",
        mission: 1,
        players: [
          { name: "Dev", profileId: "prof-dev" },
          { name: "Alice", profileId: "prof-alice" },
          { name: "Bob", profileId: "prof-bob" },
          { name: "Carol", profileId: "prof-carol" },
        ],
        nearWinValue: "4",
        nearWinColor: "blue",
      });
    });

    it("returns 500 if no non-red matching pair exists", async () => {
      setUpSeedMocks();
      mockWiresDb.getWiresByGameId.mockResolvedValue([
        makeWire({ id: "w1", playerId: "p1", color: "blue", value: "1", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", color: "red", value: "1", status: "hidden" }),
      ]);

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed-near-win" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Seed failed" });
      expect(mockWiresDb.updateWirePlayer).not.toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      mockProfilesDb.getProfileByName.mockRejectedValue(new Error("DB down"));

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed-near-win" });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Seed failed" });
    });
  });

  describe("POST /dev/seed-solo-cut-legal", () => {
    let seedApp: FastifyInstance;

    beforeEach(async () => {
      process.env.ENABLE_DEV_SEED = "true";
      seedApp = await buildApp();
    });

    afterEach(async () => {
      await seedApp.close();
      delete process.env.ENABLE_DEV_SEED;
    });

    function setUpSeedMocks() {
      const game = makeGame({ id: "g1", joinCode: "DEVGAME" });
      const devPlayer = makePlayer({ id: "p1", gameId: "g1", name: "Dev" });
      const alicePlayer = makePlayer({ id: "p2", gameId: "g1", name: "Alice" });
      const startedGame = { ...game, status: "setup" as const };
      const activeGame = { ...game, status: "active" as const };
      const players = [devPlayer, alicePlayer];

      mockProfilesDb.getProfileByName.mockResolvedValue(null);
      mockProfilesDb.createProfile.mockImplementation(async (name: string) =>
        makeProfile({ id: `prof-${name.toLowerCase()}`, name }));
      mockEngine.createGame.mockResolvedValue({ game, player: devPlayer });
      mockEngine.joinGame.mockResolvedValue({ game, player: alicePlayer, players });
      mockEngine.startGame.mockResolvedValue({ game: startedGame, players, wires: [] });
      mockEngine.completeSetup.mockResolvedValue(activeGame);
      mockGamesDb.getGameByJoinCode.mockResolvedValue(activeGame);
      mockPlayersDb.getPlayersByGameId.mockResolvedValue(players);

      return { game: activeGame, devPlayer, alicePlayer };
    }

    it("reassigns every hidden copy of a non-red value's group to Dev", async () => {
      setUpSeedMocks();

      // 4 blue "1"s split 1/1/1/1 across Dev/Alice/Alice/Alice, plus a red
      // and an other-value wire that must never be touched.
      const devWire = makeWire({ id: "w1", playerId: "p1", color: "blue", value: "1", status: "hidden" });
      const aliceWires = [
        makeWire({ id: "w2", playerId: "p2", color: "blue", value: "1", status: "hidden" }),
        makeWire({ id: "w3", playerId: "p2", color: "blue", value: "1", status: "hidden" }),
        makeWire({ id: "w4", playerId: "p2", color: "blue", value: "1", status: "hidden" }),
      ];
      const redWire = makeWire({ id: "w5", playerId: "p2", color: "red", value: "2", status: "hidden" });
      const otherWire = makeWire({ id: "w6", playerId: "p2", color: "blue", value: "3", status: "hidden" });
      mockWiresDb.getWiresByGameId.mockResolvedValue([devWire, ...aliceWires, redWire, otherWire]);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([devWire]); // Dev's current wires, for rack-position calc
      mockWiresDb.updateWirePlayer.mockImplementation(async (id, playerId, rackPosition) =>
        makeWire({ id, playerId, color: "blue", value: "1", rackPosition, status: "hidden" }));

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed-solo-cut-legal" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ joinCode: "DEVGAME", soloCutValue: "1", soloCutColor: "blue" });

      // Only Alice's 3 copies move — Dev's own copy is already in place, and
      // the red/other-value wires are never touched.
      expect(mockWiresDb.updateWirePlayer).toHaveBeenCalledTimes(3);
      expect(mockWiresDb.updateWirePlayer).toHaveBeenCalledWith("w2", "p1", expect.any(Number));
      expect(mockWiresDb.updateWirePlayer).toHaveBeenCalledWith("w3", "p1", expect.any(Number));
      expect(mockWiresDb.updateWirePlayer).toHaveBeenCalledWith("w4", "p1", expect.any(Number));
      expect(mockWiresDb.updateWirePlayer).not.toHaveBeenCalledWith("w1", expect.anything(), expect.anything());
      expect(mockWiresDb.updateWirePlayer).not.toHaveBeenCalledWith("w5", expect.anything(), expect.anything());
      expect(mockWiresDb.updateWirePlayer).not.toHaveBeenCalledWith("w6", expect.anything(), expect.anything());

      // Unlike near-win, no wires are cut and the turn is left untouched —
      // this seeds a normal active game, not an immediate-win setup.
      expect(mockWiresDb.updateWireStatus).not.toHaveBeenCalled();
      expect(mockGamesDb.updateCurrentTurn).not.toHaveBeenCalled();
    });

    it("returns the same player/profileId response shape as /dev/seed, plus the solo-cut fields", async () => {
      setUpSeedMocks();
      const wires = [1, 2, 3, 4].map(n =>
        makeWire({ id: `w${n}`, playerId: n === 1 ? "p1" : "p2", color: "blue", value: "4", status: "hidden" }));
      mockWiresDb.getWiresByGameId.mockResolvedValue(wires);
      mockWiresDb.getWiresByPlayerId.mockResolvedValue([]);
      mockWiresDb.updateWirePlayer.mockImplementation(async (id, playerId, rackPosition) =>
        makeWire({ id, playerId, color: "blue", value: "4", rackPosition, status: "hidden" }));

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed-solo-cut-legal" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        joinCode: "DEVGAME",
        profileId: "prof-dev",
        playerName: "Dev",
        mission: 1,
        players: [
          { name: "Dev", profileId: "prof-dev" },
          { name: "Alice", profileId: "prof-alice" },
          { name: "Bob", profileId: "prof-bob" },
          { name: "Carol", profileId: "prof-carol" },
        ],
        soloCutValue: "4",
        soloCutColor: "blue",
      });
    });

    it("returns 500 if no non-red wire group exists", async () => {
      setUpSeedMocks();
      mockWiresDb.getWiresByGameId.mockResolvedValue([
        makeWire({ id: "w1", playerId: "p1", color: "red", value: "1", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", color: "red", value: "1", status: "hidden" }),
      ]);

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed-solo-cut-legal" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Seed failed" });
      expect(mockWiresDb.updateWirePlayer).not.toHaveBeenCalled();
    });

    it("returns 500 on error", async () => {
      mockProfilesDb.getProfileByName.mockRejectedValue(new Error("DB down"));

      const res = await seedApp.inject({ method: "POST", url: "/dev/seed-solo-cut-legal" });
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

  describe("POST /dev/cleanup", () => {
    let devApp: FastifyInstance;

    beforeEach(async () => {
      process.env.ENABLE_DEV_SEED = "true";
      devApp = await buildApp();
    });

    afterEach(async () => {
      await devApp.close();
      delete process.env.ENABLE_DEV_SEED;
    });

    it("deletes the game and returns deleted + joinCode", async () => {
      const game = makeGame({ id: "g1", joinCode: "ABCD" });
      mockGamesDb.getGameByJoinCode.mockResolvedValue(game);
      mockGamesDb.deleteGame.mockResolvedValue(true);

      const res = await devApp.inject({
        method: "POST",
        url: "/dev/cleanup",
        payload: { joinCode: "ABCD" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ deleted: true, joinCode: "ABCD" });
      expect(mockGamesDb.deleteGame).toHaveBeenCalledWith("g1");
    });

    it("returns 404 when game is not found", async () => {
      mockGamesDb.getGameByJoinCode.mockResolvedValue(null);

      const res = await devApp.inject({
        method: "POST",
        url: "/dev/cleanup",
        payload: { joinCode: "XXXX" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Game not found" });
      expect(mockGamesDb.deleteGame).not.toHaveBeenCalled();
    });

    it("returns 400 when joinCode is missing", async () => {
      const res = await devApp.inject({
        method: "POST",
        url: "/dev/cleanup",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "joinCode is required" });
    });

    it("returns 500 on unexpected error", async () => {
      mockGamesDb.getGameByJoinCode.mockRejectedValue(new Error("DB down"));

      const res = await devApp.inject({
        method: "POST",
        url: "/dev/cleanup",
        payload: { joinCode: "ABCD" },
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Cleanup failed" });
    });
  });

  describe("GET /dev/migrations-status", () => {
    let seedApp: FastifyInstance;

    beforeEach(async () => {
      process.env.ENABLE_DEV_SEED = "true";
      seedApp = await buildApp();
    });

    afterEach(async () => {
      await seedApp.close();
      delete process.env.ENABLE_DEV_SEED;
    });

    it("returns current: true with no missing migrations when schema is up to date", async () => {
      mockMigrationsDb.getMigrationsStatus.mockResolvedValue({
        expected: ["001_initial_schema.sql", "002_mission1_updates.sql"],
        applied: ["001_initial_schema.sql", "002_mission1_updates.sql"],
        missing: [],
        current: true,
      });

      const res = await seedApp.inject({ method: "GET", url: "/dev/migrations-status" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        expected: ["001_initial_schema.sql", "002_mission1_updates.sql"],
        applied: ["001_initial_schema.sql", "002_mission1_updates.sql"],
        missing: [],
        current: true,
      });
    });

    it("returns current: false with the missing migration(s) named when schema is stale", async () => {
      mockMigrationsDb.getMigrationsStatus.mockResolvedValue({
        expected: ["001_initial_schema.sql", "008_duo_cut_pending.sql", "009_dual_cut.sql"],
        applied: ["001_initial_schema.sql"],
        missing: ["008_duo_cut_pending.sql", "009_dual_cut.sql"],
        current: false,
      });

      const res = await seedApp.inject({ method: "GET", url: "/dev/migrations-status" });

      expect(res.statusCode).toBe(200);
      expect(res.json().current).toBe(false);
      expect(res.json().missing).toEqual(["008_duo_cut_pending.sql", "009_dual_cut.sql"]);
    });

    it("returns 500 on unexpected error", async () => {
      mockMigrationsDb.getMigrationsStatus.mockRejectedValue(new Error("DB down"));

      const res = await seedApp.inject({ method: "GET", url: "/dev/migrations-status" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Migrations status check failed" });
    });
  });

  describe("dev routes gated on NODE_ENV", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      delete process.env.ENABLE_DEV_SEED;
    });

    it("does not register /dev/seed, /dev/reveal-all-tokens, /dev/hide-dev-tokens, /dev/seed-near-win, /dev/seed-solo-cut-legal, /dev/advance-turn, /dev/cleanup, or /dev/migrations-status when NODE_ENV is production, even if ENABLE_DEV_SEED is true", async () => {
      process.env.ENABLE_DEV_SEED = "true";
      process.env.NODE_ENV = "production";
      const prodApp = await buildApp();

      const seedRes = await prodApp.inject({ method: "POST", url: "/dev/seed" });
      const revealRes = await prodApp.inject({ method: "POST", url: "/dev/reveal-all-tokens", payload: { joinCode: "ABCD" } });
      const hideRes = await prodApp.inject({ method: "POST", url: "/dev/hide-dev-tokens", payload: { joinCode: "ABCD" } });
      const seedNearWinRes = await prodApp.inject({ method: "POST", url: "/dev/seed-near-win" });
      const seedSoloCutLegalRes = await prodApp.inject({ method: "POST", url: "/dev/seed-solo-cut-legal" });
      const advanceRes = await prodApp.inject({ method: "POST", url: "/dev/advance-turn", payload: { joinCode: "ABCD" } });
      const cleanupRes = await prodApp.inject({ method: "POST", url: "/dev/cleanup", payload: { joinCode: "ABCD" } });
      const migrationsStatusRes = await prodApp.inject({ method: "GET", url: "/dev/migrations-status" });

      expect(seedRes.statusCode).toBe(404);
      expect(revealRes.statusCode).toBe(404);
      expect(hideRes.statusCode).toBe(404);
      expect(seedNearWinRes.statusCode).toBe(404);
      expect(seedSoloCutLegalRes.statusCode).toBe(404);
      expect(advanceRes.statusCode).toBe(404);
      expect(cleanupRes.statusCode).toBe(404);
      expect(migrationsStatusRes.statusCode).toBe(404);

      await prodApp.close();
    });
  });

  describe("CORS — Vercel preview origins (issue #121)", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      delete process.env.ENABLE_DEV_SEED;
    });

    it("allows a matching Vercel preview origin when dev tooling is enabled", async () => {
      process.env.ENABLE_DEV_SEED = "true";
      const devApp = await buildApp();

      const res = await devApp.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://tabletop-abc1234de-c-azzone416s-projects.vercel.app" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "https://tabletop-abc1234de-c-azzone416s-projects.vercel.app",
      );

      await devApp.close();
    });

    it.each([
      { label: "wrong account scope (lookalike project)", origin: "https://tabletop-abc1234de-attacker-projects.vercel.app" },
      { label: "domain-suffix attack", origin: "https://tabletop-abc1234de-c-azzone416s-projects.vercel.app.attacker.com" },
      { label: "http instead of https", origin: "http://tabletop-abc1234de-c-azzone416s-projects.vercel.app" },
      { label: "unrelated origin", origin: "https://evil.com" },
    ])("rejects a non-matching origin even when dev tooling is enabled ($label)", async ({ origin }) => {
      process.env.ENABLE_DEV_SEED = "true";
      const devApp = await buildApp();

      const res = await devApp.inject({ method: "GET", url: "/health", headers: { origin } });

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();

      await devApp.close();
    });

    it("never allows a preview origin when NODE_ENV is production, even if ENABLE_DEV_SEED is true", async () => {
      process.env.ENABLE_DEV_SEED = "true";
      process.env.NODE_ENV = "production";
      const prodApp = await buildApp();

      const res = await prodApp.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://tabletop-abc1234de-c-azzone416s-projects.vercel.app" },
      });

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();

      await prodApp.close();
    });

    it("never allows a preview origin when dev tooling is disabled, even outside production", async () => {
      const devToolsOffApp = await buildApp();

      const res = await devToolsOffApp.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://tabletop-abc1234de-c-azzone416s-projects.vercel.app" },
      });

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();

      await devToolsOffApp.close();
    });

    it("still honors the static CORS_ORIGINS allowlist regardless of the preview pattern", async () => {
      const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://localhost:3000" } });

      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    });
  });
});
