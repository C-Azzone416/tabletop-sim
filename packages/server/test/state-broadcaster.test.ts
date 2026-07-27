import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WebSocket } from "ws";
import { buildPlayerView, broadcastGameState } from "../src/ws/state-broadcaster.js";
import { makeWire, makeGame, makePlayer, resetIds } from "./fixtures.js";

vi.mock("../src/db/wires.js", () => ({ getWiresByGameId: vi.fn() }));
vi.mock("../src/db/tokens.js", () => ({
  getInfoTokensByGameId: vi.fn(),
  getValidationTokensByGameId: vi.fn(),
}));
vi.mock("../src/db/candidates.js", () => ({
  getWireCandidatesByGameId: vi.fn(),
}));
vi.mock("../src/ws/connection-manager.js", () => ({
  getGameSockets: vi.fn(() => new Map()),
  sendToPlayer: vi.fn(),
}));

import * as wiresDb from "../src/db/wires.js";
import * as tokensDb from "../src/db/tokens.js";
import * as candidatesDb from "../src/db/candidates.js";
import * as connManager from "../src/ws/connection-manager.js";

const mockWiresDb = vi.mocked(wiresDb);
const mockTokensDb = vi.mocked(tokensDb);
const mockCandidatesDb = vi.mocked(candidatesDb);
const mockConnManager = vi.mocked(connManager);

describe("state-broadcaster", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
  });

  describe("buildPlayerView", () => {
    it("shows own hidden wires and redacts other players' hidden wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", status: "hidden" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBe("3"); // own wire — visible
      expect(view[1].value).toBeNull(); // other's wire — redacted
    });

    // #187 negative-path test (per the #decisions 2026-07-24 policy): another
    // player's hidden wire must arrive with BOTH value and color null —
    // color alone is mission-deciding information on red-wire missions.
    it("redacts BOTH value and color on other players' hidden wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", color: "red", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", color: "red", status: "hidden" }),
        makeWire({ id: "w3", playerId: "p2", value: "2", color: "yellow", status: "hidden" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].color).toBe("red"); // own wire — color visible
      expect(view[1].value).toBeNull();
      expect(view[1].color).toBeNull(); // other's hidden red — fully redacted
      expect(view[2].value).toBeNull();
      expect(view[2].color).toBeNull(); // other's hidden yellow — fully redacted
    });

    it("keeps color on other players' cut and revealed wires (public once resolved)", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p2", value: "3", color: "blue", status: "cut" }),
        makeWire({ id: "w2", playerId: "p2", value: "1", color: "red", status: "revealed" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].color).toBe("blue");
      expect(view[0].value).toBe("3");
      expect(view[1].color).toBe("red");
      expect(view[1].value).toBe("1");
    });

    it("does not redact own cut wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "cut" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBe("3"); // cut wire — visible
    });

    it("does not redact own revealed wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "revealed" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBe("3");
    });

    it("shows cut wires from other players (not hidden)", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p2", value: "1", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "2", status: "cut" }),
        makeWire({ id: "w3", playerId: "p3", value: "4", status: "hidden" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBeNull(); // other player's hidden wire — redacted
      expect(view[1].value).toBe("2");  // other player's cut wire — visible
      expect(view[2].value).toBeNull(); // other player's hidden wire — redacted
    });

    it("handles empty wire array", () => {
      const view = buildPlayerView([], "p1");
      expect(view).toEqual([]);
    });

    it("does not mutate the original wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p2", value: "3", status: "hidden" }),
      ];

      buildPlayerView(wires, "p1");
      expect(wires[0].value).toBe("3"); // original unchanged even though view redacts it
    });
  });

  describe("broadcastGameState", () => {
    it("sends a per-player redacted game_state message to every connected socket", async () => {
      const game = makeGame({ id: "g1" });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", status: "hidden" }),
      ];
      const infoTokens = [{ id: "t1", gameId: "g1", wireId: "w1", value: "3", placedAt: "" }];
      const validationTokens = [{ id: "v1", gameId: "g1", wireValue: "3", wireColor: "blue" as const, validatedAt: "" }];
      const gameSockets = new Map([["p1", {}], ["p2", {}]]) as Map<string, WebSocket>;

      mockWiresDb.getWiresByGameId.mockResolvedValue(wires);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue(infoTokens);
      mockTokensDb.getValidationTokensByGameId.mockResolvedValue(validationTokens);
      mockCandidatesDb.getWireCandidatesByGameId.mockResolvedValue([]);
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);

      await broadcastGameState("g1", game, players);

      expect(mockWiresDb.getWiresByGameId).toHaveBeenCalledWith("g1");
      expect(mockConnManager.sendToPlayer).toHaveBeenCalledTimes(2);
      expect(mockConnManager.sendToPlayer).toHaveBeenCalledWith("g1", "p1", expect.objectContaining({
        type: "game_state", game, players, infoTokens, validationTokens, localPlayerId: "p1",
      }));
      expect(mockConnManager.sendToPlayer).toHaveBeenCalledWith("g1", "p2", expect.objectContaining({
        localPlayerId: "p2",
      }));
    });

    it("redacts each recipient's view of other players' hidden wires", async () => {
      const game = makeGame({ id: "g1" });
      const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", status: "hidden" }),
      ];
      const gameSockets = new Map([["p1", {}], ["p2", {}]]) as Map<string, WebSocket>;

      mockWiresDb.getWiresByGameId.mockResolvedValue(wires);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([]);
      mockTokensDb.getValidationTokensByGameId.mockResolvedValue([]);
      mockCandidatesDb.getWireCandidatesByGameId.mockResolvedValue([]);
      mockConnManager.getGameSockets.mockReturnValue(gameSockets);

      await broadcastGameState("g1", game, players);

      const calls = mockConnManager.sendToPlayer.mock.calls;
      const p1Message = calls.find(c => c[1] === "p1")![2] as { wires: { id: string; value: string | null }[] };
      const p2Message = calls.find(c => c[1] === "p2")![2] as { wires: { id: string; value: string | null }[] };

      expect(p1Message.wires.find(w => w.id === "w1")!.value).toBe("3"); // own wire
      expect(p1Message.wires.find(w => w.id === "w2")!.value).toBeNull(); // other's redacted
      expect(p2Message.wires.find(w => w.id === "w2")!.value).toBe("5"); // own wire
      expect(p2Message.wires.find(w => w.id === "w1")!.value).toBeNull(); // other's redacted
    });

    it("sends nothing when no sockets are connected for the game", async () => {
      mockWiresDb.getWiresByGameId.mockResolvedValue([]);
      mockTokensDb.getInfoTokensByGameId.mockResolvedValue([]);
      mockTokensDb.getValidationTokensByGameId.mockResolvedValue([]);
      mockCandidatesDb.getWireCandidatesByGameId.mockResolvedValue([]);
      mockConnManager.getGameSockets.mockReturnValue(new Map());

      await broadcastGameState("g1", makeGame({ id: "g1" }), []);

      expect(mockConnManager.sendToPlayer).not.toHaveBeenCalled();
    });
  });
});
