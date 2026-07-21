"use client";

import type { ValidationToken, WireColor } from "@tabletop/shared";
import { MISSION_CONFIGS } from "@tabletop/shared";

interface ValidationTrackerProps {
  validationTokens: ValidationToken[];
  missionNumber: number;
}

const COLOR_STYLES: Record<
  WireColor,
  { validated: string; unvalidated: string; label: string }
> = {
  blue: {
    validated:
      "border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    unvalidated:
      "border-blue-200 bg-white text-blue-300 dark:border-blue-800 dark:bg-zinc-800 dark:text-blue-700",
    label: "B",
  },
  yellow: {
    validated:
      "border-yellow-500 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    unvalidated:
      "border-yellow-200 bg-white text-yellow-300 dark:border-yellow-800 dark:bg-zinc-800 dark:text-yellow-700",
    label: "Y",
  },
  red: {
    validated:
      "border-red-500 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    unvalidated:
      "border-red-200 bg-white text-red-300 dark:border-red-800 dark:bg-zinc-800 dark:text-red-700",
    label: "R",
  },
};

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
            const styles = COLOR_STYLES[group.color];
            return (
              <div
                key={key}
                title={`${group.color} ${value}`}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 font-bold transition-all ${
                  validated ? styles.validated : styles.unvalidated
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
