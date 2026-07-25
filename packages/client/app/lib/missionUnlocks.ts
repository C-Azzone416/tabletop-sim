import type { MissionOutcomeResult } from "@tabletop/shared";
import { LAST_MISSION } from "./missions";

// #179: unlocked set = {1..highest_beaten+1}. Mission 1 is pre-unlocked for
// a fresh profile (no outcomes yet, highestBeaten stays 0). Losses unlock
// nothing — only "won" advances the ceiling.
export function highestUnlockedMission(
  outcomes: Record<number, MissionOutcomeResult>,
): number {
  let highestBeaten = 0;
  for (const [mission, outcome] of Object.entries(outcomes)) {
    if (outcome === "won") {
      highestBeaten = Math.max(highestBeaten, Number(mission));
    }
  }
  return Math.min(highestBeaten + 1, LAST_MISSION);
}
