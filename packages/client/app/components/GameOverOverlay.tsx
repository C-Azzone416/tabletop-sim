"use client";

import { useRouter } from "next/navigation";

interface GameOverOverlayProps {
  result: "won" | "lost";
  reason: string;
}

export function GameOverOverlay({ result, reason }: GameOverOverlayProps) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-zinc-800">
        <div className="text-5xl">
          {result === "won" ? "🎉" : "💥"}
        </div>
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
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-full bg-zinc-800 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-600 dark:hover:bg-zinc-500"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
