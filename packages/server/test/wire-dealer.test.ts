import { describe, it, expect } from "vitest";
import { dealWires } from "../src/engine/wire-dealer.js";

describe("wire-dealer", () => {
  describe("dealWires — Mission 1 (default)", () => {
    it("deals 24 wires total for 2 players (12 each)", () => {
      const wires = dealWires(["p1", "p2"], "p1");
      expect(wires).toHaveLength(24);

      const p1Wires = wires.filter((w) => w.playerId === "p1");
      const p2Wires = wires.filter((w) => w.playerId === "p2");
      expect(p1Wires).toHaveLength(12);
      expect(p2Wires).toHaveLength(12);
    });

    it("deals 24 wires for 3 players (captain gets 12, others get 6)", () => {
      const wires = dealWires(["p1", "p2", "p3"], "p1");
      expect(wires).toHaveLength(24);

      const p1Wires = wires.filter((w) => w.playerId === "p1");
      const p2Wires = wires.filter((w) => w.playerId === "p2");
      const p3Wires = wires.filter((w) => w.playerId === "p3");
      expect(p1Wires).toHaveLength(12);
      expect(p2Wires).toHaveLength(6);
      expect(p3Wires).toHaveLength(6);
    });

    it("deals 24 wires for 4 players (6 each)", () => {
      const wires = dealWires(["p1", "p2", "p3", "p4"], "p1");
      expect(wires).toHaveLength(24);

      for (const pid of ["p1", "p2", "p3", "p4"]) {
        const playerWires = wires.filter((w) => w.playerId === pid);
        expect(playerWires).toHaveLength(6);
      }
    });

    it("includes exactly 4 copies of each value 1-6", () => {
      const wires = dealWires(["p1", "p2"], "p1");
      for (let v = 1; v <= 6; v++) {
        const count = wires.filter((w) => w.value === String(v)).length;
        expect(count).toBe(4);
      }
    });

    it("all wires are blue (Mission 1)", () => {
      const wires = dealWires(["p1", "p2"], "p1");
      expect(wires.every((w) => w.color === "blue")).toBe(true);
    });

    it("assigns sequential rack positions per player", () => {
      const wires = dealWires(["p1", "p2"], "p1");
      const p1Wires = wires.filter((w) => w.playerId === "p1");
      const positions = p1Wires.map((w) => w.rackPosition);
      expect(positions).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    });

    it("sorts wires by value within each player rack", () => {
      const wires = dealWires(["p1", "p2"], "p1");
      const p1Wires = wires.filter((w) => w.playerId === "p1");
      for (let i = 1; i < p1Wires.length; i++) {
        expect(Number(p1Wires[i].value)).toBeGreaterThanOrEqual(
          Number(p1Wires[i - 1].value)
        );
      }
    });

    it("throws for invalid player count (1)", () => {
      expect(() => dealWires(["p1"], "p1")).toThrow("Invalid player count");
    });

    it("throws for invalid player count (5)", () => {
      expect(() => dealWires(["p1", "p2", "p3", "p4", "p5"], "p1")).toThrow(
        "Invalid player count"
      );
    });

    it("shuffles — two deals are unlikely identical", () => {
      const deal1 = dealWires(["p1", "p2"], "p1");
      const deal2 = dealWires(["p1", "p2"], "p1");
      // Compare the value sequences — vanishingly unlikely to be the same
      const vals1 = deal1.map((w) => w.value).join(",");
      const vals2 = deal2.map((w) => w.value).join(",");
      expect(vals1 === vals2).toBe(false);
    });
  });

  describe("dealWires — Mission 3 (blue + yellow)", () => {
    it("deals 28 wires total for 2 players (14 each)", () => {
      const wires = dealWires(["p1", "p2"], "p1", 3);
      expect(wires).toHaveLength(28);
      expect(wires.filter((w) => w.playerId === "p1")).toHaveLength(14);
      expect(wires.filter((w) => w.playerId === "p2")).toHaveLength(14);
    });

    it("deals 28 wires for 3 players (captain 14, others 7)", () => {
      const wires = dealWires(["p1", "p2", "p3"], "p1", 3);
      expect(wires).toHaveLength(28);
      expect(wires.filter((w) => w.playerId === "p1")).toHaveLength(14);
      expect(wires.filter((w) => w.playerId === "p2")).toHaveLength(7);
      expect(wires.filter((w) => w.playerId === "p3")).toHaveLength(7);
    });

    it("includes 16 blue wires and 12 yellow wires", () => {
      const wires = dealWires(["p1", "p2"], "p1", 3);
      expect(wires.filter((w) => w.color === "blue")).toHaveLength(16);
      expect(wires.filter((w) => w.color === "yellow")).toHaveLength(12);
      expect(wires.filter((w) => w.color === "red")).toHaveLength(0);
    });

    it("sorts blue wires before yellow within each player rack", () => {
      const wires = dealWires(["p1", "p2"], "p1", 3);
      const p1Wires = wires.filter((w) => w.playerId === "p1");
      const lastBlue = p1Wires.map((w) => w.color).lastIndexOf("blue");
      const firstYellow = p1Wires.map((w) => w.color).indexOf("yellow");
      if (lastBlue !== -1 && firstYellow !== -1) {
        expect(lastBlue).toBeLessThan(firstYellow);
      }
    });
  });

  describe("dealWires — Mission 5 (blue + yellow + red)", () => {
    it("deals 32 wires total for 2 players (16 each)", () => {
      const wires = dealWires(["p1", "p2"], "p1", 5);
      expect(wires).toHaveLength(32);
      expect(wires.filter((w) => w.playerId === "p1")).toHaveLength(16);
      expect(wires.filter((w) => w.playerId === "p2")).toHaveLength(16);
    });

    it("includes 16 blue, 12 yellow, 4 red wires", () => {
      const wires = dealWires(["p1", "p2"], "p1", 5);
      expect(wires.filter((w) => w.color === "blue")).toHaveLength(16);
      expect(wires.filter((w) => w.color === "yellow")).toHaveLength(12);
      expect(wires.filter((w) => w.color === "red")).toHaveLength(4);
    });

    it("deals 32 wires for 4 players (8 each)", () => {
      const wires = dealWires(["p1", "p2", "p3", "p4"], "p1", 5);
      expect(wires).toHaveLength(32);
      for (const pid of ["p1", "p2", "p3", "p4"]) {
        expect(wires.filter((w) => w.playerId === pid)).toHaveLength(8);
      }
    });
  });

  describe("dealWires — Mission 8 (36 wires, hardest)", () => {
    it("deals 36 wires total for 2 players (18 each)", () => {
      const wires = dealWires(["p1", "p2"], "p1", 8);
      expect(wires).toHaveLength(36);
      expect(wires.filter((w) => w.playerId === "p1")).toHaveLength(18);
      expect(wires.filter((w) => w.playerId === "p2")).toHaveLength(18);
    });

    it("includes 16 blue, 12 yellow, 8 red wires", () => {
      const wires = dealWires(["p1", "p2"], "p1", 8);
      expect(wires.filter((w) => w.color === "blue")).toHaveLength(16);
      expect(wires.filter((w) => w.color === "yellow")).toHaveLength(12);
      expect(wires.filter((w) => w.color === "red")).toHaveLength(8);
    });
  });

  describe("dealWires — invalid mission", () => {
    it("throws for unknown mission number", () => {
      expect(() => dealWires(["p1", "p2"], "p1", 9)).toThrow("Unknown mission");
    });
  });
});
