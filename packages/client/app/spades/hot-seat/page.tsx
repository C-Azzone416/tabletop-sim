"use client";

import Link from "next/link";
import { useState } from "react";
import type { BotDifficulty, TargetScore } from "@tabletop/game-spades";
import { HotSeatGame } from "../../components/spades/HotSeatGame";
import { createHotSeatSession, type HotSeatSession } from "../hot-seat-session";

const DIFFICULTIES: BotDifficulty[] = ["easy", "normal", "hard"];
const TARGETS: TargetScore[] = [250, 500, 750];

export default function HotSeatPage() {
  const [humanCount, setHumanCount] = useState(1);
  const [names, setNames] = useState(["Player 1", "Player 2", "Player 3", "Player 4"]);
  const [targetScore, setTargetScore] = useState<TargetScore>(250);
  const [bots, setBots] = useState<BotDifficulty[]>(["normal", "normal", "normal"]);
  const [session, setSession] = useState<HotSeatSession | null>(null);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const humans = names.slice(0, humanCount).map((name, index) => ({
        id: `hot-seat-${index + 1}`,
        name: name.trim() || `Player ${index + 1}`,
      }));
      setSession(await createHotSeatSession({
        humans,
        botDifficulties: bots.slice(0, 4 - humanCount),
        targetScore,
      }));
    } finally {
      setStarting(false);
    }
  };

  if (session) return <HotSeatGame initialSession={session} />;

  return (
    <main className="min-h-screen bg-surface px-4 py-6 font-sans sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        <Link href="/play" className="press min-h-11 text-body text-ink-muted hover:text-ink">← Back</Link>
        <header className="mt-4 sm:mt-6">
          <h1 className="text-display-l-sm font-display tracking-tight text-ink sm:text-display-l">Spades · Hot seat</h1>
          <p className="mt-2 text-body text-ink-muted">
            Share one device. Each hand stays hidden until the named player confirms it is safe to look.
          </p>
        </header>

        <section className="mt-8 space-y-6 rounded-cab border-2 border-outline bg-surface-raised p-5 shadow-print-md">
          <label className="block">
            <span className="mb-2 block font-bold text-ink">People on this device</span>
            <select
              value={humanCount}
              onChange={(event) => setHumanCount(Number(event.target.value))}
              className="min-h-11 w-full rounded-cab border-2 border-outline bg-surface px-3 text-ink"
            >
              {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>

          {names.slice(0, humanCount).map((name, index) => (
            <label key={index} className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">Player {index + 1}</span>
              <input
                value={name}
                maxLength={20}
                onChange={(event) => setNames((current) => current.map((value, candidate) => (
                  candidate === index ? event.target.value : value
                )))}
                className="min-h-11 w-full rounded-cab border-2 border-outline bg-surface px-3 text-ink"
              />
            </label>
          ))}

          <div>
            <span className="mb-2 block font-bold text-ink">Play to</span>
            <div className="flex flex-wrap gap-2">
              {TARGETS.map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setTargetScore(score)}
                  className={`press min-h-11 rounded-cab border-2 border-outline px-4 py-2 font-bold ${
                    targetScore === score ? "bg-accent text-accent-ink" : "bg-surface text-ink"
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>

          {bots.slice(0, 4 - humanCount).map((difficulty, index) => (
            <label key={index} className="flex items-center justify-between gap-4 text-ink">
              <span className="font-semibold">Computer {index + 1}</span>
              <select
                value={difficulty}
                onChange={(event) => setBots((current) => current.map((value, candidate) => (
                  candidate === index ? event.target.value as BotDifficulty : value
                )))}
                className="min-h-11 rounded-cab border-2 border-outline bg-surface px-3"
              >
                {DIFFICULTIES.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ))}

          <button
            type="button"
            onClick={() => void start()}
            disabled={starting}
            className="press min-h-11 w-full rounded-cab border-2 border-outline bg-accent px-5 py-3 font-bold text-accent-ink shadow-print-sm disabled:opacity-50"
          >
            {starting ? "Dealing…" : "Deal cards"}
          </button>
        </section>
      </div>
    </main>
  );
}
