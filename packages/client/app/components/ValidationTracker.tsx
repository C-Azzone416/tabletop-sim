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
      <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Validated
      </h3>
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        {config.wireGroups.map((group) =>
          group.values.map((value) => {
            const key = `${group.color}-${value}`;
            const validated = validatedKeys.has(key);
            return (
              <div
                key={key}
                title={`${group.color} ${value}`}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 font-bold transition-all ${
                  validated
                    ? "border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500"
                    : "border-green-500 bg-white text-green-600 dark:border-green-600 dark:bg-zinc-800 dark:text-green-400"
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
