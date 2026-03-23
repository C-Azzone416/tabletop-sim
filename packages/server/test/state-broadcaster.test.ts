import { describe, it, expect, beforeEach } from "vitest";
import { buildPlayerView } from "../src/ws/state-broadcaster.js";
import { makeWire, resetIds } from "./fixtures.js";

describe("state-broadcaster", () => {
  beforeEach(() => resetIds());

  describe("buildPlayerView", () => {
    it("redacts values for the requesting player's own hidden wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "5", status: "hidden" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBeNull(); // own wire — redacted
      expect(view[1].value).toBe("5"); // other's wire — visible
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

    it("shows all other players' wires regardless of status", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p2", value: "1", status: "hidden" }),
        makeWire({ id: "w2", playerId: "p2", value: "2", status: "cut" }),
        makeWire({ id: "w3", playerId: "p3", value: "4", status: "hidden" }),
      ];

      const view = buildPlayerView(wires, "p1");
      expect(view[0].value).toBe("1");
      expect(view[1].value).toBe("2");
      expect(view[2].value).toBe("4");
    });

    it("handles empty wire array", () => {
      const view = buildPlayerView([], "p1");
      expect(view).toEqual([]);
    });

    it("does not mutate the original wires", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", value: "3", status: "hidden" }),
      ];

      buildPlayerView(wires, "p1");
      expect(wires[0].value).toBe("3"); // original unchanged
    });
  });
});
