"use client";

import { MISSION_DESCRIPTIONS } from "../lib/missions";

interface MissionSelectorProps {
  selectedMission: number;
  onSelectMission: (mission: number) => void;
  // #179: {1..highestUnlocked} are pickable; higher missions render locked.
  highestUnlocked: number;
}

export function MissionSelector({
  selectedMission,
  onSelectMission,
  highestUnlocked,
}: MissionSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(MISSION_DESCRIPTIONS).map(([num, desc]) => {
        const mission = Number(num);
        const isSelected = selectedMission === mission;
        const isLocked = mission > highestUnlocked;

        if (isLocked) {
          return (
            <div
              key={mission}
              data-testid={`mission-locked-${mission}`}
              className="cursor-not-allowed rounded-cab border-2 border-outline/40 bg-surface px-3 py-2 text-left opacity-60"
            >
              <span className="flex items-center gap-1 text-sm font-semibold text-ink-muted">
                <span aria-hidden="true">🔒</span> Mission {mission}
              </span>
              <p className="mt-0.5 text-xs text-ink-muted">
                Beat mission {mission - 1} to unlock
              </p>
            </div>
          );
        }

        return (
          <button
            key={mission}
            onClick={() => onSelectMission(mission)}
            className={`rounded-cab border-2 px-3 py-2 text-left transition-colors ${
              isSelected
                ? "border-outline bg-accent/10"
                : "border-outline/40 bg-surface-raised hover:border-outline"
            }`}
          >
            <span className="text-sm font-semibold text-ink">
              Mission {mission}
            </span>
            <p
              className={`mt-0.5 text-xs ${
                isSelected ? "text-ink" : "text-ink-muted"
              }`}
            >
              {desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}
