import { describe, it, expect } from "vitest";
import { dealWires, drawColorGroup, buildDeck } from "../src/engine/wire-dealer.js";
import type { MissionConfig } from "@tabletop/shared";

describe("wire-dealer", () => {
  describe("dealWires — Mission 1 (default)", () => {
    it("deals 24 wires total for 2 players (12 each)", () => {
      const { wires } = dealWires(["p1", "p2"], "p1");
      expect(wires).toHaveLength(24);

      const p1Wires = wires.filter((w) => w.playerId === "p1");
      const p2Wires = wires.filter((w) => w.playerId === "p2");
      expect(p1Wires).toHaveLength(12);
      expect(p2Wires).toHaveLength(12);
    });

    it("deals 24 wires for 3 players (captain gets 12, others get 6)", () => {
      const { wires } = dealWires(["p1", "p2", "p3"], "p1");
      expect(wires).toHaveLength(24);

      const p1Wires = wires.filter((w) => w.playerId === "p1");
      const p2Wires = wires.filter((w) => w.playerId === "p2");
      const p3Wires = wires.filter((w) => w.playerId === "p3");
      expect(p1Wires).toHaveLength(12);
      expect(p2Wires).toHaveLength(6);
      expect(p3Wires).toHaveLength(6);
    });

    it("deals 24 wires for 4 players (6 each)", () => {
      const { wires } = dealWires(["p1", "p2", "p3", "p4"], "p1");
      expect(wires).toHaveLength(24);

      for (const pid of ["p1", "p2", "p3", "p4"]) {
        const playerWires = wires.filter((w) => w.playerId === pid);
        expect(playerWires).toHaveLength(6);
      }
    });

    it("includes exactly 4 copies of each value 1-6", () => {
      const { wires } = dealWires(["p1", "p2"], "p1");
      for (let v = 1; v <= 6; v++) {
        const count = wires.filter((w) => w.value === String(v)).length;
        expect(count).toBe(4);
      }
    });

    it("all wires are blue (Mission 1)", () => {
      const { wires } = dealWires(["p1", "p2"], "p1");
      expect(wires.every((w) => w.color === "blue")).toBe(true);
    });

    it("assigns sequential rack positions per player", () => {
      const { wires } = dealWires(["p1", "p2"], "p1");
      const p1Wires = wires.filter((w) => w.playerId === "p1");
      const positions = p1Wires.map((w) => w.rackPosition);
      expect(positions).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    });

    it("sorts wires by value within each player rack", () => {
      const { wires } = dealWires(["p1", "p2"], "p1");
      const p1Wires = wires.filter((w) => w.playerId === "p1");
      for (let i = 1; i < p1Wires.length; i++) {
        expect(Number(p1Wires[i].value)).toBeGreaterThanOrEqual(
          Number(p1Wires[i - 1].value)
        );
      }
    });

    it("throws for invalid player count (0)", () => {
      expect(() => dealWires([], "p1")).toThrow("Invalid player count");
    });

    it("throws for invalid player count (5)", () => {
      expect(() => dealWires(["p1", "p2", "p3", "p4", "p5"], "p1")).toThrow(
        "Invalid player count"
      );
    });

    it("shuffles — two deals are unlikely identical", () => {
      const { wires: deal1 } = dealWires(["p1", "p2"], "p1");
      const { wires: deal2 } = dealWires(["p1", "p2"], "p1");
      // Compare the value sequences — vanishingly unlikely to be the same
      const vals1 = deal1.map((w) => w.value).join(",");
      const vals2 = deal2.map((w) => w.value).join(",");
      expect(vals1 === vals2).toBe(false);
    });
  });

  // #190 Phase A: missions 2-8's yellow/red groups are TODO(#216) placeholders
  // (real per-mission counts come from Caroline's physical Mission cards).
  // These tests exercise the new data-model mechanics — single interleaved
  // sort, decimal singleton draws, exact-value matching — not the specific
  // (placeholder) numbers, which are expected to change wholesale in #216.
  describe("dealWires — Mission 3 (blue + yellow placeholder)", () => {
    it("deals the configured total across 2 players", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 3);
      expect(wires).toHaveLength(16); // 8 + 8, per MISSION_3_CONFIG.wiresPerPlayer
    });

    it("includes at most 11 yellow wires (singleton master set) and no duplicate yellow values", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 3);
      const yellowValues = wires.filter((w) => w.color === "yellow").map((w) => w.value);
      expect(yellowValues.length).toBeLessThanOrEqual(11);
      expect(new Set(yellowValues).size).toBe(yellowValues.length);
    });

    it("yellow wire values carry the .1 decimal sort suffix, not a bare integer", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 3);
      const yellowWires = wires.filter((w) => w.color === "yellow");
      for (const w of yellowWires) {
        expect(w.value).toMatch(/^\d+\.1$/);
      }
    });

    it("racks a mixed-color hand as a single ascending numeric sequence (no color grouping)", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 3);
      const p1Wires = wires.filter((w) => w.playerId === "p1");
      const values = p1Wires.map((w) => Number(w.value));
      const sorted = [...values].sort((a, b) => a - b);
      expect(values).toEqual(sorted);
    });
  });

  describe("dealWires — Mission 5 (blue + yellow + red placeholders)", () => {
    it("deals the configured total for 2 players", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 5);
      expect(wires).toHaveLength(32); // 16 + 16, per MISSION_5_CONFIG.wiresPerPlayer
    });

    it("red wire values carry the .5 decimal sort suffix", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 5);
      const redWires = wires.filter((w) => w.color === "red");
      for (const w of redWires) {
        expect(w.value).toMatch(/^\d+\.5$/);
      }
    });

    it("a guessed integer value never string-equals a decimal wire value (exact-match, no int coercion)", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 5);
      const decimalWires = wires.filter((w) => w.color !== "blue");
      for (const w of decimalWires) {
        const flooredGuess = String(Math.trunc(Number(w.value)));
        expect(w.value).not.toBe(flooredGuess);
      }
    });
  });

  describe("dealWires — Mission 8 (36 wires, hardest)", () => {
    it("deals the configured total for 2 players", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 8);
      expect(wires).toHaveLength(36); // 18 + 18, per MISSION_8_CONFIG.wiresPerPlayer
    });

    it("uses the full confirmed 48-tile blue set (values 1-12, 4 copies each) as the draw pool", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 8);
      const blueValues = wires.filter((w) => w.color === "blue").map((w) => Number(w.value));
      for (const v of blueValues) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(12);
      }
    });
  });

  describe("dealWires — invalid mission", () => {
    it("throws for unknown mission number", () => {
      expect(() => dealWires(["p1", "p2"], "p1", 9)).toThrow("Unknown mission");
    });
  });

  describe("drawColorGroup — full-knowledge (no partial-knowledge draw)", () => {
    it("deals exactly `count` distinct values with the color's decimal suffix", () => {
      const { dealt, candidates } = drawColorGroup("yellow", { count: 3 });
      expect(dealt).toHaveLength(3);
      expect(new Set(dealt).size).toBe(3);
      for (const v of dealt) expect(v).toMatch(/^\d+\.1$/);
      // No partial-knowledge draw requested — candidates equals dealt exactly.
      expect([...candidates].sort()).toEqual([...dealt].sort());
    });

    it("throws if count exceeds the 11-singleton master set", () => {
      expect(() => drawColorGroup("red", { count: 12 })).toThrow(/exceeds the master set/);
    });
  });

  describe('drawColorGroup — partial-knowledge "N out of M" draw', () => {
    it("reveals candidatePoolSize (M) values but deals only count (N) of them", () => {
      const { dealt, candidates } = drawColorGroup("yellow", { count: 2, candidatePoolSize: 3 });
      expect(dealt).toHaveLength(2);
      expect(candidates).toHaveLength(3);
    });

    it("every dealt value is drawn from the revealed candidate pool", () => {
      const { dealt, candidates } = drawColorGroup("red", { count: 1, candidatePoolSize: 3 });
      for (const v of dealt) {
        expect(candidates).toContain(v);
      }
    });

    it("candidates are distinct singleton values within the color's master range", () => {
      const { candidates } = drawColorGroup("yellow", { count: 1, candidatePoolSize: 5 });
      expect(new Set(candidates).size).toBe(5);
      for (const v of candidates) {
        const n = Number(v.replace(".1", ""));
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(11);
      }
    });

    it("throws if candidatePoolSize is smaller than count", () => {
      expect(() => drawColorGroup("yellow", { count: 3, candidatePoolSize: 2 })).toThrow(
        /must be >= count/
      );
    });

    it("throws if candidatePoolSize exceeds the 11-singleton master set", () => {
      expect(() => drawColorGroup("red", { count: 1, candidatePoolSize: 12 })).toThrow(
        /exceeds the master set/
      );
    });
  });

  // #220 — the dealer-contract fix: a mission's yellow/red counts are a
  // guarantee, not a maximum draw from a larger blue-sized pool. A SINGLE
  // green run doesn't prove this (that's exactly how #220 reached develop
  // in the first place, per heron) — repeated deals across many iterations
  // are the actual acceptance criterion.
  describe("dealWires — #220 guaranteed non-blue colors across repeated deals", () => {
    const ITERATIONS = 200;

    it("mission 5 (yellow + red guaranteed) always deals both colors, every iteration, 2 players", () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const { wires } = dealWires(["p1", "p2"], "p1", 5);
        const yellowCount = wires.filter((w) => w.color === "yellow").length;
        const redCount = wires.filter((w) => w.color === "red").length;
        expect(yellowCount, `iteration ${i}: yellow`).toBe(1);
        expect(redCount, `iteration ${i}: red`).toBe(1);
      }
    });

    it("mission 5 always deals both colors, every iteration, 3 and 4 players", () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const { wires: wires3 } = dealWires(["p1", "p2", "p3"], "p1", 5);
        expect(wires3.filter((w) => w.color === "yellow"), `3p iteration ${i}`).toHaveLength(1);
        expect(wires3.filter((w) => w.color === "red"), `3p iteration ${i}`).toHaveLength(1);

        const { wires: wires4 } = dealWires(["p1", "p2", "p3", "p4"], "p1", 5);
        expect(wires4.filter((w) => w.color === "yellow"), `4p iteration ${i}`).toHaveLength(1);
        expect(wires4.filter((w) => w.color === "red"), `4p iteration ${i}`).toHaveLength(1);
      }
    });

    it("mission 3 (yellow only) always deals the guaranteed yellow, every iteration", () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const { wires } = dealWires(["p1", "p2"], "p1", 3);
        expect(wires.filter((w) => w.color === "yellow"), `iteration ${i}`).toHaveLength(1);
      }
    });

    it("mission 8 (yellow + red) always deals both colors, every iteration", () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const { wires } = dealWires(["p1", "p2"], "p1", 8);
        expect(wires.filter((w) => w.color === "yellow"), `iteration ${i}`).toHaveLength(1);
        expect(wires.filter((w) => w.color === "red"), `iteration ${i}`).toHaveLength(1);
      }
    });

    it("the total dealt always exactly matches wiresPerPlayer capacity — no leftover, nothing undealt", () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const { wires } = dealWires(["p1", "p2"], "p1", 5);
        expect(wires, `iteration ${i}`).toHaveLength(32);
      }
    });
  });

  describe("buildDeck — #220 capacity guarantee", () => {
    const baseConfig: MissionConfig = {
      wireGroups: [
        { color: "blue", values: [1, 2, 3, 4], copiesPerValue: 4 },
        { color: "yellow", count: 2 },
      ],
      totalWires: 18,
      detonator: { 2: 4, 3: 5, 4: 6 },
      wiresPerPlayer: { 2: 9, 3: { captain: 6, others: 6 }, 4: 5 },
    };

    it("deals every guaranteed non-blue tile and fills the rest with blue, sized to exactly capacity", () => {
      const { deck, candidates } = buildDeck(baseConfig, 10);
      expect(deck).toHaveLength(10);
      expect(deck.filter((w) => w.color === "yellow")).toHaveLength(2);
      expect(deck.filter((w) => w.color === "blue")).toHaveLength(8);
      // No candidatePoolSize on this group — candidates equal dealt by
      // construction, so #215's candidate list stays empty (nothing extra
      // to advertise beyond the normal dealt wires).
      expect(candidates).toHaveLength(0);
    });

    it("#215: a genuine N-of-M group (candidatePoolSize > count) surfaces the full M-value candidate pool", () => {
      const nOfMConfig: MissionConfig = {
        ...baseConfig,
        wireGroups: [
          { color: "blue", values: [1, 2, 3, 4], copiesPerValue: 4 },
          { color: "yellow", count: 1, candidatePoolSize: 3 },
        ],
      };
      const { deck, candidates } = buildDeck(nOfMConfig, 9);
      expect(deck.filter((w) => w.color === "yellow")).toHaveLength(1);
      expect(candidates).toHaveLength(3);
      expect(candidates.every((c) => c.color === "yellow")).toBe(true);
      // The single dealt yellow value must be among the 3 candidates.
      const dealtYellow = deck.find((w) => w.color === "yellow")!.value;
      expect(candidates.map((c) => c.value)).toContain(dealtYellow);
    });

    it("throws if the guaranteed non-blue count alone exceeds capacity, rather than silently dropping tiles", () => {
      expect(() => buildDeck(baseConfig, 1)).toThrow(
        /guarantee 2 non-blue wires but only 1 stand slots/
      );
    });

    it("throws if capacity demands more blue than the configured blue pool provides", () => {
      const tinyBluePool: MissionConfig = {
        ...baseConfig,
        wireGroups: [
          { color: "blue", values: [1], copiesPerValue: 2 }, // pool of 2
          { color: "yellow", count: 1 },
        ],
      };
      expect(() => buildDeck(tinyBluePool, 10)).toThrow(
        /needs 9 blue wires to fill remaining capacity but the blue pool only has 2/
      );
    });
  });
});
