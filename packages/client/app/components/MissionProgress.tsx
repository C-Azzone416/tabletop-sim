"use client";

import type { MissionOutcomeResult } from "@tabletop/shared";
import { LAST_MISSION } from "../lib/missions";

interface MissionProgressProps {
  outcomes: Record<number, MissionOutcomeResult>;
}

// #170: per-profile home-screen indicator — beaten missions get a check
// mark, tried-but-failed get an X, never-played missions show just the
// number. Read-only; mission selection itself stays in MissionSelector.
export function MissionProgress({ outcomes }: MissionProgressProps) {
  const missions = Array.from({ length: LAST_MISSION }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label="Mission progress">
      {missions.map((mission) => {
        const outcome = outcomes[mission];
        return (
          <div
            key={mission}
            data-testid={`mission-progress-${mission}`}
            className={`flex h-9 w-9 items-center justify-center gap-0.5 rounded-lg border text-xs font-semibold ${
              outcome === "won"
                ? "border-green-400 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400"
                : outcome === "lost"
                  ? "border-red-400 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400"
                  : "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
            }`}
          >
            <span>{mission}</span>
            {outcome === "won" && <span aria-label="beaten">✓</span>}
            {outcome === "lost" && <span aria-label="tried, not yet beaten">✗</span>}
          </div>
        );
      })}
    </div>
  );
}
