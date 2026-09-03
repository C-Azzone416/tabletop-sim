"use client";

import { useState } from "react";
import type { BotDifficulty, TargetScore } from "@tabletop/shared";
import { HotSeatGame } from "../../components/spades/HotSeatGame";
import { createHotSeatSession, type HotSeatSession } from "../hot-seat-session";

const DIFFICULTIES: BotDifficulty[] = ["easy", "normal", "hard"];

export default function HotSeatPage() {
  const [humanCount, setHumanCount] = useState(2);
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
    <main className="mx-auto min-h-screen max-w-lg bg-zinc-50 px-5 py-8 dark:bg-zinc-950">
      <h1 className="text-3xl font-black text-zinc-900 dark:text-white">Spades · Hot seat</h1>
      <p className="mt-2 text-zinc-500">Share one device. The screen hides each hand until the named player confirms it is safe to look.</p>

      <section className="mt-7 space-y-5 rounded-2xl border bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <label className="block">
          <span className="mb-2 block font-bold">People on this device</span>
          <select value={humanCount} onChange={(event) => setHumanCount(Number(event.target.value))}
            className="w-full rounded-lg border bg-transparent p-3 dark:border-zinc-600">
            {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>

        {names.slice(0, humanCount).map((name, index) => (
          <label key={index} className="block">
            <span className="mb-1 block text-sm font-semibold">Player {index + 1}</span>
            <input value={name} maxLength={20}
              onChange={(event) => setNames((current) => current.map((value, candidate) => candidate === index ? event.target.value : value))}
              className="w-full rounded-lg border bg-transparent p-3 dark:border-zinc-600" />
          </label>
        ))}

        <div>
          <span className="mb-2 block font-bold">Play to</span>
          <div className="flex gap-2">
            {([250, 500, 750] as TargetScore[]).map((score) => (
              <button key={score} type="button" onClick={() => setTargetScore(score)}
                className={`rounded-lg px-4 py-2 ${targetScore === score ? "bg-emerald-700 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                {score}
              </button>
            ))}
          </div>
        </div>

        {bots.slice(0, 4 - humanCount).map((difficulty, index) => (
          <label key={index} className="flex items-center justify-between">
            <span className="font-semibold">Computer {index + 1}</span>
            <select value={difficulty}
              onChange={(event) => setBots((current) => current.map((value, candidate) => candidate === index ? event.target.value as BotDifficulty : value))}
              className="rounded-lg border bg-transparent p-2 dark:border-zinc-600">
              {DIFFICULTIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}

        <button type="button" onClick={() => void start()} disabled={starting}
          className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">
          {starting ? "Dealing…" : "Deal cards"}
        </button>
      </section>
    </main>
  );
}
