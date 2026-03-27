import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildPlayerView } from "../src/ws/state-broadcaster.js";
import { makeWire, resetIds } from "./fixtures.js";

vi.mock("../src/db/wires.js", () => ({ getWiresByGameId: vi.fn() }));
vi.mock("../src/db/tokens.js", () => ({
  getInfoTokensByGameId: vi.fn(),
  getValidationTokensByGameId: vi.fn(),
}));
vi.mock("../src/ws/connection-manager.js", () => ({
  getGameSockets: vi.fn(() => new Map()),
  sendToPlayer: vi.fn(),
}));

describe("state-broadcaster", () => {
  beforeEach(() => resetIds());

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
});
