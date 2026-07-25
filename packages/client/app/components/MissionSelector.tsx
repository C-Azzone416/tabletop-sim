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
              className="cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <span className="flex items-center gap-1 text-sm font-semibold text-zinc-400 dark:text-zinc-500">
                <span aria-hidden="true">🔒</span> Mission {mission}
              </span>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                Beat mission {mission - 1} to unlock
              </p>
            </div>
          );
        }

        return (
          <button
            key={mission}
            onClick={() => onSelectMission(mission)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              isSelected
                ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
            }`}
          >
            <span
              className={`text-sm font-semibold ${
                isSelected
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-zinc-900 dark:text-zinc-100"
              }`}
            >
              Mission {mission}
            </span>
            <p
              className={`mt-0.5 text-xs ${
                isSelected
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-zinc-500 dark:text-zinc-400"
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
