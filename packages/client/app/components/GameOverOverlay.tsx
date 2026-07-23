"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MissionSelector } from "./MissionSelector";
import { LAST_MISSION } from "../lib/missions";

interface GameOverOverlayProps {
  result: "won" | "lost";
  reason: string;
  isCaptain: boolean;
  currentMission: number;
  onNextMission: (mission: number) => void;
}

export function GameOverOverlay({
  result,
  reason,
  isCaptain,
  currentMission,
  onNextMission,
}: GameOverOverlayProps) {
  const router = useRouter();
  const nextMissionUp = Math.min(currentMission + 1, LAST_MISSION);
  const [selectedMission, setSelectedMission] = useState(nextMissionUp);
  const [isPicking, setIsPicking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const handleStartMission = (mission: number) => {
    if (isStarting) return;
    setIsStarting(true);
    onNextMission(mission);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-zinc-800">
        {result === "won" ? (
          <div className="text-5xl">🎉</div>
        ) : (
          <BombExplosion />
        )}
        <h2
          className={`mt-4 text-2xl font-bold ${
            result === "won"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {result === "won" ? "Mission Complete!" : "Mission Failed"}
        </h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{reason}</p>

        {isCaptain ? (
          <div className="mt-6 flex flex-col gap-3">
            {isPicking ? (
              <div className="text-left">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Select Mission
                </h3>
                <MissionSelector
                  selectedMission={selectedMission}
                  onSelectMission={setSelectedMission}
                />
                <button
                  onClick={() => handleStartMission(selectedMission)}
                  disabled={isStarting}
                  className="mt-3 w-full rounded-full bg-green-600 px-6 py-3 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isStarting ? "Starting..." : `Start Mission ${selectedMission}`}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() =>
                    handleStartMission(result === "won" ? nextMissionUp : currentMission)
                  }
                  disabled={isStarting}
                  className={`rounded-full px-6 py-3 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    result === "won"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {isStarting
                    ? "Starting..."
                    : result === "won"
                      ? `Next Mission (${nextMissionUp})`
                      : `Retry Mission ${currentMission}`}
                </button>
                <button
                  onClick={() => setIsPicking(true)}
                  disabled={isStarting}
                  className="text-sm font-medium text-zinc-500 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400"
                >
                  Pick a Different Mission
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
            Waiting for the captain to choose the next mission...
          </p>
        )}

        <button
          onClick={() => router.push("/")}
          className="mt-4 rounded-full bg-zinc-100 px-6 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

// #158: a bit of personality on the loss moment — an expanding shockwave
// ring behind the bomb emoji, plus a brief screen shake on mount. CSS-only,
// no asset pipeline.
function BombExplosion() {
  return (
    <div className="relative flex items-center justify-center">
      <style>{`
        @keyframes bomb-shockwave {
          0% { transform: scale(0.2); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes bomb-pop {
          0% { transform: scale(0.4) rotate(-8deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(4deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes bomb-shake {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-3px, 2px); }
          40% { transform: translate(3px, -2px); }
          60% { transform: translate(-2px, -1px); }
          80% { transform: translate(2px, 1px); }
        }
        .bomb-shockwave-ring {
          animation: bomb-shockwave 0.6s ease-out;
        }
        .bomb-emoji {
          animation: bomb-pop 0.4s ease-out, bomb-shake 0.4s ease-in-out 0.4s;
        }
      `}</style>
      <div
        className="bomb-shockwave-ring absolute h-16 w-16 rounded-full bg-red-500/40"
        aria-hidden="true"
      />
      <div className="bomb-emoji text-5xl">💥</div>
    </div>
  );
}
