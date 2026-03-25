import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeProfile, resetIds } from "./fixtures.js";

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
  markDoubleDetectorUsed: vi.fn(),
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

import * as profilesDb from "../src/db/profiles.js";
import { buildApp } from "../src/app.js";

const mockProfilesDb = vi.mocked(profilesDb);

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
});
