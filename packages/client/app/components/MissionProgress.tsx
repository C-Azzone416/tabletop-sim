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
            className={`flex h-9 w-9 items-center justify-center gap-0.5 rounded-cab border text-xs font-semibold ${
              outcome === "won"
                ? "border-success/40 bg-success/10 text-success"
                : outcome === "lost"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-outline/20 bg-surface-raised text-ink-muted"
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
