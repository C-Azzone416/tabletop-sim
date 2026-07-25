import { describe, it, expect } from "vitest";
import type { MissionOutcomeResult } from "@tabletop/shared";
import { highestUnlockedMission } from "../app/lib/missionUnlocks";
import { LAST_MISSION } from "../app/lib/missions";

describe("highestUnlockedMission (#179)", () => {
  it("unlocks only mission 1 for a fresh profile with no outcomes", () => {
    expect(highestUnlockedMission({})).toBe(1);
  });

  it("unlocks mission N+1 once mission N is won", () => {
    expect(highestUnlockedMission({ 1: "won" })).toBe(2);
    expect(highestUnlockedMission({ 1: "won", 2: "won" })).toBe(3);
  });

  it("a loss unlocks nothing beyond what's already been won", () => {
    expect(highestUnlockedMission({ 1: "lost" })).toBe(1);
    expect(highestUnlockedMission({ 1: "won", 2: "lost" })).toBe(2);
  });

  it("takes the highest win, not the most recent outcome", () => {
    expect(highestUnlockedMission({ 1: "won", 2: "won", 3: "lost" })).toBe(3);
  });

  it("caps at LAST_MISSION even if every mission is won", () => {
    const allWon: Record<number, MissionOutcomeResult> = Object.fromEntries(
      Array.from({ length: LAST_MISSION }, (_, i) => [i + 1, "won"]),
    );
    expect(highestUnlockedMission(allWon)).toBe(LAST_MISSION);
  });
});
