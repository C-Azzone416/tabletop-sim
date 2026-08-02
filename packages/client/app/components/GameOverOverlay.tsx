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
  // #179: {1..highestUnlocked} are pickable for the captain.
  highestUnlocked: number;
}

export function GameOverOverlay({
  result,
  reason,
  isCaptain,
  currentMission,
  onNextMission,
  highestUnlocked,
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

  // Button variants per DESIGN-APPENDIX.md §7/§16 — no green/success button
  // exists in the platform's fixed vocabulary (primary/secondary/yellow/
  // danger/ghost), so affirmative CTAs map to primary and the loss-state
  // retry maps to yellow rather than inventing a new button color.
  const primaryBtn =
    "press min-h-11 rounded-cab border-2 border-outline bg-accent px-6 py-3 font-bold text-accent-ink shadow-print-sm disabled:cursor-not-allowed disabled:opacity-50";
  const yellowBtn =
    "press min-h-11 rounded-cab border-2 border-outline bg-warning px-6 py-3 font-bold text-warning-ink shadow-print-sm disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryBtn =
    "press min-h-11 rounded-cab border-2 border-outline bg-surface-raised px-6 py-3 text-sm font-bold text-ink shadow-print-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-cab border-2 border-outline bg-surface-raised p-8 text-center shadow-print-md">
        {result === "won" ? (
          <div className="text-5xl">🎉</div>
        ) : (
          <BombExplosion />
        )}
        <h2
          className={`mt-4 text-2xl font-bold ${
            result === "won" ? "text-success" : "text-danger"
          }`}
        >
          {result === "won" ? "Mission Complete!" : "Mission Failed"}
        </h2>
        <p className="mt-2 text-ink-muted">{reason}</p>

        {isCaptain ? (
          <div className="mt-6 flex flex-col gap-3">
            {isPicking ? (
              <div className="text-left">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">
                  Select Mission
                </h3>
                <MissionSelector
                  selectedMission={selectedMission}
                  onSelectMission={setSelectedMission}
                  highestUnlocked={highestUnlocked}
                />
                <button
                  onClick={() => handleStartMission(selectedMission)}
                  disabled={isStarting}
                  className={`mt-3 w-full ${primaryBtn}`}
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
                  className={result === "won" ? primaryBtn : yellowBtn}
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
                  className="text-sm font-medium text-ink-muted underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Pick a Different Mission
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-ink-muted">
            Waiting for the captain to choose the next mission...
          </p>
        )}

        <button onClick={() => router.push("/")} className={`mt-4 w-full ${secondaryBtn}`}>
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
        className="bomb-shockwave-ring absolute h-16 w-16 rounded-full bg-danger/40"
        aria-hidden="true"
      />
      <div className="bomb-emoji text-5xl">💥</div>
    </div>
  );
}
