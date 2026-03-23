"use client";

import type { ValidationToken } from "@tabletop/shared";
import { MISSION_1_CONFIG } from "@tabletop/shared";

interface ValidationTrackerProps {
  validationTokens: ValidationToken[];
}

export function ValidationTracker({
  validationTokens,
}: ValidationTrackerProps) {
  const validatedValues = new Set(validationTokens.map((t) => t.wireValue));

  return (
    <div className="flex flex-col items-center gap-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Validated
      </h3>
      <div className="flex gap-2">
        {MISSION_1_CONFIG.values.map((value) => {
          const validated = validatedValues.has(String(value));
          return (
            <div
              key={value}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 font-bold transition-all ${
                validated
                  ? "border-green-500 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-500"
              }`}
            >
              {value}
            </div>
          );
        })}
      </div>
    </div>
  );
}
