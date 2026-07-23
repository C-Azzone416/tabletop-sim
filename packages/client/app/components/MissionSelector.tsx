"use client";

import { MISSION_DESCRIPTIONS } from "../lib/missions";

interface MissionSelectorProps {
  selectedMission: number;
  onSelectMission: (mission: number) => void;
}

export function MissionSelector({ selectedMission, onSelectMission }: MissionSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(MISSION_DESCRIPTIONS).map(([num, desc]) => {
        const mission = Number(num);
        const isSelected = selectedMission === mission;
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
