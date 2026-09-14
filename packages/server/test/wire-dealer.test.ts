import { describe, it, expect } from "vitest";
import { dealWires, drawColorGroup, buildDeck, computeWireCounts, computeTraySizes } from "../src/engine/wire-dealer.js";
import { MISSION_CONFIGS } from "@tabletop/shared";
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

    // #435 — 5 players is now valid (the registry's ceiling); the guard
    // rejects only past it.
    it("throws for invalid player count (6, past the registry's 5-player ceiling)", () => {
      expect(() => dealWires(["p1", "p2", "p3", "p4", "p5", "p6"], "p1")).toThrow(
        "Invalid player count"
      );
    });

    it("deals 24 wires for 5 players (5/5/5/5/4, captain gets a 5)", () => {
      const { wires } = dealWires(["p1", "p2", "p3", "p4", "p5"], "p1");
      expect(wires).toHaveLength(24);

      const counts = ["p1", "p2", "p3", "p4", "p5"].map(
        (pid) => wires.filter((w) => w.playerId === pid).length
      );
      expect(counts).toEqual([5, 5, 5, 5, 4]);
    });

    // #473 — the two-deal version of this test compared SORTED rack value
    // sequences (racks are sorted ascending, #190 Phase A), which discards
    // the shuffle's entropy rather than measuring it: Mission 1 has only
    // 1,751 distinct sorted 12-card multisets drawable from its pool, so
    // two independent deals collide roughly 1-in-1,000, not "vanishingly
    // unlikely" as the old comment claimed — and this suite runs often
    // enough that a 1-in-1,000 flake is a when, not an if.
    //
    // dealWires only ever returns the sorted rack (deal order isn't part
    // of its public surface, and shouldn't be added just for this test),
    // so the fix is volume rather than looking earlier in the pipeline:
    // over N independent deals, ALL N landing on the same sorted multiset
    // is (1/1751)^(N-1) — negligible well before N reaches double digits.
    it("shuffles — repeated deals are not all identical", () => {
      const dealCount = 20;
      const distinctDeals = new Set<string>();
      for (let i = 0; i < dealCount; i++) {
        const { wires } = dealWires(["p1", "p2"], "p1");
        distinctDeals.add(wires.map((w) => w.value).join(","));
      }
      expect(distinctDeals.size).toBeGreaterThan(1);
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
      expect(wires).toHaveLength(16); // 8 + 8, per the tray model (totalWires=16)
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
      expect(wires).toHaveLength(32); // 16 + 16, per the tray model (totalWires=32)
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
      expect(wires).toHaveLength(36); // 18 + 18, per the tray model (totalWires=36)
    });

    it("uses the full confirmed 48-tile blue set (values 1-12, 4 copies each) as the draw pool", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 8);
      const blueValues = wires.filter((w) => w.color === "blue").map((w) => Number(w.value));
      for (const v of blueValues) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(12);
      }
    });

    // #253 gap list — the only mission-config shape with all three colors
    // guaranteed present at once. Checks each hand independently (sort
    // correctness never depends on which colors happen to land together)
    // and separately confirms all three colors actually appear across the
    // deal, so this isn't vacuously true on an all-blue hand.
    it("racks a full yellow+red+blue mix as a single ascending numeric sequence, no color grouping", () => {
      const { wires } = dealWires(["p1", "p2"], "p1", 8);
      for (const pid of ["p1", "p2"]) {
        const hand = wires.filter((w) => w.playerId === pid);
        const values = hand.map((w) => Number(w.value));
        const sorted = [...values].sort((a, b) => a - b);
        expect(values).toEqual(sorted);
      }
      const colors = new Set(wires.map((w) => w.color));
      expect(colors).toEqual(new Set(["blue", "yellow", "red"]));
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

    // Security regression (weasel, PR #227 review): `dealt` is computed as
    // the PREFIX of the pre-shuffle draw, so without an independent
    // reshuffle, the dealt value would always land at index 0 of
    // `candidates` — a positional leak of exactly the secret this whole
    // model exists to keep (which candidate is real vs. decoy). This
    // asserts the leak is actually closed, not just that the fields are
    // present: across many draws, the dealt value's index within
    // `candidates` must NOT be stuck at a fixed position.
    it("does not leak which candidate is dealt via array position (count=1 lands at every index, not always 0)", () => {
      const ITERATIONS = 300;
      const indexCounts = new Map<number, number>();

      for (let i = 0; i < ITERATIONS; i++) {
        const { dealt, candidates } = drawColorGroup("yellow", { count: 1, candidatePoolSize: 3 });
        const index = candidates.indexOf(dealt[0]);
        indexCounts.set(index, (indexCounts.get(index) ?? 0) + 1);
      }

      // With a real shuffle, all 3 positions should appear roughly a third
      // of the time each. The pre-fix code always put it at index 0 — this
      // would see indexCounts = Map{0: 300} and fail outright. Loose bound
      // (>10% each) avoids flaking on shuffle variance while still failing
      // hard on the "always index 0" regression this guards against.
      expect(indexCounts.size).toBe(3);
      for (const count of indexCounts.values()) {
        expect(count).toBeGreaterThan(ITERATIONS * 0.1);
      }
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

    it("the total dealt always exactly matches the tray-model capacity — no leftover, nothing undealt", () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const { wires } = dealWires(["p1", "p2"], "p1", 5);
        expect(wires, `iteration ${i}`).toHaveLength(32);
      }
    });
  });

  // #435 — the tray model replacing the eight per-mission wiresPerPlayer
  // tables. This is the regression gate for the refactor: it must reproduce
  // every stored 2p/3p/4p config exactly, since this is a refactor of
  // existing behaviour, not a change to it.
  describe("computeWireCounts / computeTraySizes — the tray model (#435)", () => {
    // The 24 stored 2p/3p/4p configs this refactor must reproduce exactly,
    // keyed by totalWires (several missions share a totalWires and
    // therefore share a row) — see #435's issue body.
    const STORED_CONFIGS: Array<{ totalWires: number; expected: Record<number, number[]> }> = [
      { totalWires: 24, expected: { 2: [12, 12], 3: [12, 6, 6], 4: [6, 6, 6, 6] } }, // missions 1, 2
      { totalWires: 16, expected: { 2: [8, 8], 3: [8, 4, 4], 4: [4, 4, 4, 4] } }, // mission 3
      { totalWires: 28, expected: { 2: [14, 14], 3: [14, 7, 7], 4: [7, 7, 7, 7] } }, // mission 4
      { totalWires: 32, expected: { 2: [16, 16], 3: [16, 8, 8], 4: [8, 8, 8, 8] } }, // missions 5, 6
      { totalWires: 36, expected: { 2: [18, 18], 3: [18, 9, 9], 4: [9, 9, 9, 9] } }, // missions 7, 8
    ];

    it("reproduces all 24 stored 2p/3p/4p configs exactly", () => {
      for (const { totalWires, expected } of STORED_CONFIGS) {
        for (const playerCount of [2, 3, 4] as const) {
          expect(computeWireCounts(totalWires, playerCount)).toEqual(expected[playerCount]);
        }
      }
    });

    it("produces the new 5-player deal per mission's totalWires — index 0 (captain) gets the largest tray", () => {
      expect(computeWireCounts(24, 5)).toEqual([5, 5, 5, 5, 4]);
      expect(computeWireCounts(16, 5)).toEqual([4, 3, 3, 3, 3]);
      expect(computeWireCounts(28, 5)).toEqual([6, 6, 6, 5, 5]);
      expect(computeWireCounts(32, 5)).toEqual([7, 7, 6, 6, 6]);
      expect(computeWireCounts(36, 5)).toEqual([8, 7, 7, 7, 7]);
    });

    it("the dealt total always equals totalWires exactly, for every player count 1-5 (#220's guarantee, generalised)", () => {
      for (const totalWires of [16, 24, 28, 32, 36]) {
        for (let playerCount = 1; playerCount <= 5; playerCount++) {
          const counts = computeWireCounts(totalWires, playerCount);
          expect(counts.reduce((a, b) => a + b, 0), `totalWires=${totalWires} playerCount=${playerCount}`).toBe(totalWires);
        }
      }
    });

    it("no player ever receives a partial tray — tray sizes are always whole numbers", () => {
      for (const totalWires of [16, 24, 28, 32, 36]) {
        for (const trayCount of [4, 5]) {
          for (const size of computeTraySizes(totalWires, trayCount)) {
            expect(Number.isInteger(size)).toBe(true);
          }
        }
      }
    });

    it("every real mission's totalWires is divisible by 4 — the structural invariant the model depends on", () => {
      for (const mission of Object.values(MISSION_CONFIGS)) {
        expect(mission.totalWires % 4).toBe(0);
      }
    });

    it("every real mission's dealt total matches totalWires exactly, for every supported player count 2-5", () => {
      for (const mission of Object.values(MISSION_CONFIGS)) {
        for (let playerCount = 2; playerCount <= 5; playerCount++) {
          const counts = computeWireCounts(mission.totalWires, playerCount);
          expect(counts.reduce((a, b) => a + b, 0)).toBe(mission.totalWires);
        }
      }
    });

    // #435 — detonator[5] is provisional (extrapolated, not sourced from
    // the rulebook): assert only that a value EXISTS for every mission at
    // every supported player count, never that it's correct, so Caroline's
    // eventual rulebook correction doesn't read as a regression here.
    it("every mission has a detonator value for every supported player count 2-5", () => {
      for (const mission of Object.values(MISSION_CONFIGS)) {
        for (const playerCount of [2, 3, 4, 5]) {
          expect(mission.detonator[playerCount]).toBeTypeOf("number");
        }
      }
    });

    // computeTraySizes itself is a pure function and stays well-defined
    // even off the totalWires%4===0 invariant (dealWires is what enforces
    // that invariant, asserted in the mission-config test above) — this
    // just confirms the sizes still sum correctly in that case.
    it("computeTraySizes sums to totalWires even for a totalWires the tray model wasn't designed for", () => {
      expect(computeTraySizes(17, 4).reduce((a, b) => a + b, 0)).toBe(17);
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
