"use client";

import { useMemo, useState } from "react";
import type { Player } from "@tabletop/shared";
import type { BotDifficulty, TargetScore } from "@tabletop/game-spades";

interface SpadesOnlineLobbyProps {
  players: Player[];
  localPlayerId: string;
  captainId: string | null;
  onReady: () => void;
  onLeave: () => void;
  onStart: (targetScore: TargetScore, botDifficulties: BotDifficulty[]) => void;
}

const TARGETS: TargetScore[] = [250, 500, 750];
const DIFFICULTIES: BotDifficulty[] = ["easy", "normal", "hard"];

export function SpadesOnlineLobby({
  players,
  localPlayerId,
  captainId,
  onReady,
  onLeave,
  onStart,
}: SpadesOnlineLobbyProps) {
  const isCaptain = localPlayerId === captainId;
  const localPlayer = players.find((player) => player.id === localPlayerId);
  const allReady = players.length > 0 && players.every((player) => player.ready);
  const botCount = Math.max(0, 4 - players.length);
  const [targetScore, setTargetScore] = useState<TargetScore>(250);
  const [difficulties, setDifficulties] = useState<BotDifficulty[]>(["normal", "normal", "normal"]);
  const activeDifficulties = useMemo(() => difficulties.slice(0, botCount), [botCount, difficulties]);

  const changeDifficulty = (index: number, difficulty: BotDifficulty) => {
    setDifficulties((current) => current.map((value, candidate) => candidate === index ? difficulty : value));
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-5 py-20 text-ink">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-ink-muted">Online room</p>
        <h1 className="text-display font-black tracking-tight">Spades</h1>
        <p className="mt-2 text-ink-muted">Invite up to three people. Computers fill every empty seat.</p>
      </header>

      <section className="rounded-cab border-2 border-outline bg-surface-raised p-5 shadow-print-md">
        <h2 className="font-bold">Human players ({players.length}/4)</h2>
        <ul className="mt-3 space-y-2">
          {players.map((player) => (
            <li key={player.id} className="flex min-h-11 items-center justify-between border-b border-outline/40 py-2 last:border-b-0">
              <span className="font-medium">{player.name}{player.id === localPlayerId ? " (you)" : ""}</span>
              <span className="text-sm text-ink-muted">
                {player.ready ? "Ready" : "Not ready"}{player.id === captainId ? " · Host" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isCaptain && (
        <section className="space-y-5 rounded-cab border-2 border-outline bg-surface-raised p-5 shadow-print-md">
          <div>
            <h2 className="font-bold">Play to</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {TARGETS.map((score) => (
                <button key={score} type="button" onClick={() => setTargetScore(score)} className={`press min-h-11 rounded-cab border-2 border-outline px-5 py-2 font-bold ${targetScore === score ? "bg-accent text-accent-ink" : "bg-surface"}`}>
                  {score}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-bold">Computer seats ({botCount})</h2>
            <div className="mt-2 space-y-2">
              {activeDifficulties.map((difficulty, index) => (
                <label key={index} className="flex items-center justify-between gap-4">
                  <span>Computer {index + 1}</span>
                  <select value={difficulty} onChange={(event) => changeDifficulty(index, event.target.value as BotDifficulty)} className="min-h-11 rounded-cab border-2 border-outline bg-surface px-3 py-2">
                    {DIFFICULTIES.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              ))}
              {botCount === 0 && <p className="text-sm text-ink-muted">All four seats are human.</p>}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        {!localPlayer?.ready && (
          <button type="button" onClick={onReady} className="press min-h-11 rounded-cab border-2 border-outline bg-accent px-6 py-3 font-bold text-accent-ink shadow-print-sm">
            I’m Ready
          </button>
        )}
        {isCaptain && localPlayer?.ready && (
          <button type="button" disabled={!allReady} onClick={() => onStart(targetScore, activeDifficulties)} className="press min-h-11 rounded-cab border-2 border-outline bg-accent px-6 py-3 font-bold text-accent-ink shadow-print-sm disabled:cursor-not-allowed disabled:opacity-50">
            Start Spades
          </button>
        )}
        <button type="button" onClick={onLeave} className="press min-h-11 px-3 py-3 text-ink-muted">Leave room</button>
      </div>

      {localPlayer?.ready && !allReady && <p className="text-sm text-ink-muted">Waiting for everyone to ready up…</p>}
      {allReady && !isCaptain && <p className="text-sm text-ink-muted">Waiting for the host to start…</p>}
    </main>
  );
}
