"use client";

import { useMemo, useState } from "react";
import type { BotDifficulty, Player, TargetScore } from "@tabletop/shared";

interface SpadesLobbyProps {
  joinCode: string;
  players: Player[];
  localPlayerId: string;
  captainId: string | null;
  onReady: () => void;
  onStart: (targetScore: TargetScore, botDifficulties: BotDifficulty[]) => void;
}

const DIFFICULTIES: BotDifficulty[] = ["easy", "normal", "hard"];
const TARGETS: TargetScore[] = [250, 500, 750];

export function SpadesLobby({
  joinCode,
  players,
  localPlayerId,
  captainId,
  onReady,
  onStart,
}: SpadesLobbyProps) {
  const isCaptain = localPlayerId === captainId;
  const localPlayer = players.find((player) => player.id === localPlayerId);
  const allReady = players.length > 0 && players.every((player) => player.ready);
  const botCount = Math.max(0, 4 - players.length);
  const [targetScore, setTargetScore] = useState<TargetScore>(250);
  const [difficulties, setDifficulties] = useState<BotDifficulty[]>(["normal", "normal", "normal"]);
  const bots = useMemo(() => difficulties.slice(0, botCount), [botCount, difficulties]);

  const setBotDifficulty = (index: number, difficulty: BotDifficulty) => {
    setDifficulties((current) => current.map((value, candidate) =>
      candidate === index ? difficulty : value
    ));
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 bg-zinc-50 px-5 py-8 dark:bg-zinc-950">
      <header className="text-center">
        <h1 className="text-3xl font-black text-zinc-900 dark:text-white">Spades lobby</h1>
        <p className="mt-2 text-zinc-500">Join code</p>
        <code className="text-2xl font-bold tracking-[0.3em] text-emerald-700">{joinCode}</code>
      </header>

      <section>
        <h2 className="mb-2 font-bold text-zinc-900 dark:text-white">Human players ({players.length}/4)</h2>
        <ul className="space-y-2">
          {players.map((player) => (
            <li key={player.id} className="flex justify-between rounded-xl border bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
              <span>{player.name}{player.id === localPlayerId ? " (you)" : ""}</span>
              <span>{player.ready ? "Ready" : "Not ready"}{player.id === captainId ? " · Host" : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      {isCaptain && (
        <section className="space-y-4 rounded-2xl border bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div>
            <label className="mb-2 block font-bold">Quick game score</label>
            <div className="flex gap-2">
              {TARGETS.map((score) => (
                <button key={score} type="button" onClick={() => setTargetScore(score)}
                  className={`rounded-lg px-4 py-2 ${targetScore === score ? "bg-emerald-700 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                  {score}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 font-bold">Computer seats ({botCount})</h2>
            {bots.map((difficulty, index) => (
              <label key={index} className="mb-2 flex items-center justify-between">
                <span>Computer {index + 1}</span>
                <select value={difficulty} onChange={(event) => setBotDifficulty(index, event.target.value as BotDifficulty)}
                  className="rounded-lg border bg-transparent px-3 py-2 dark:border-zinc-600">
                  {DIFFICULTIES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {!localPlayer?.ready && (
        <button type="button" onClick={onReady} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">
          Ready
        </button>
      )}

      {isCaptain && localPlayer?.ready && (
        <button type="button" disabled={!allReady} onClick={() => onStart(targetScore, bots)}
          className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">
          Start Spades
        </button>
      )}

      {localPlayer?.ready && !allReady && <p className="text-center text-zinc-500">Waiting for everyone to ready up…</p>}
      {allReady && !isCaptain && <p className="text-center text-zinc-500">Waiting for the host to start…</p>}
    </main>
  );
}
