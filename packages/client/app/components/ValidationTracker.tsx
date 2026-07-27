"use client";

import type { ValidationToken } from "@tabletop/shared";
import { MISSION_CONFIGS } from "@tabletop/shared";

interface ValidationTrackerProps {
  validationTokens: ValidationToken[];
  missionNumber: number;
}

// #153 (Caroline, 2026-07-23): validation completion states are green
// throughout, no per-wire-color coding — outline + number while pending,
// solid fill once a number fully validates. Pairs with #143's lives
// countdown as game-status clarity work.
export function ValidationTracker({
  validationTokens,
  missionNumber,
}: ValidationTrackerProps) {
  const config = MISSION_CONFIGS[missionNumber] ?? MISSION_CONFIGS[1];
  const validatedKeys = new Set(
    validationTokens.map((t) => `${t.wireColor}-${t.wireValue}`)
  );

  return (
    <div className="flex flex-col items-center gap-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
        Validated
      </h3>
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        {config.wireGroups
          // #190 Phase A: yellow/red groups no longer carry a fixed `values`
          // list (drawn at random per-game from the master set — see
          // WireGroup in @tabletop/shared), so this tracker can't pre-render
          // their slots from mission config alone anymore. Blue-only for
          // now; TODO(#190 Phase C) — needs the actual per-game wire list
          // (not just missionNumber) to know which yellow/red values exist.
          .filter((group) => group.color === "blue")
          .map((group) =>
            group.values.map((value) => {
              const key = `${group.color}-${value}`;
              const validated = validatedKeys.has(key);
              return (
                <div
                  key={key}
                  title={`${group.color} ${value}`}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 font-bold transition-all ${
                    // #153: validation is green throughout — this game's success
                    // color and its p4 seat color are the same green, so reuse
                    // the seat token pair for guaranteed-readable fill contrast.
                    validated
                      ? "border-p4 bg-p4 text-p4-ink"
                      : "border-p4 bg-game-table text-p4"
                  }`}
                >
                  {value}
                </div>
              );
            })
          )}
      </div>
    </div>
  );
}
