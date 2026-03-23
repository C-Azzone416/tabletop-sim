"use client";

interface DetonatorProps {
  position: number;
  max: number;
}

export function Detonator({ position, max }: DetonatorProps) {
  const segments = Array.from({ length: max }, (_, i) => i);
  const dangerLevel = position / max;

  return (
    <div className="flex flex-col items-center gap-2">
      <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Detonator
      </h3>
      <div className="flex items-end gap-1">
        {segments.map((i) => {
          const filled = i < position;
          const ratio = i / (max - 1);
          let colorClass = "bg-green-500";
          if (ratio > 0.66) colorClass = "bg-red-500";
          else if (ratio > 0.33) colorClass = "bg-yellow-500";

          return (
            <div
              key={i}
              className={`w-6 rounded-sm transition-all ${
                filled ? colorClass : "bg-zinc-200 dark:bg-zinc-700"
              }`}
              style={{ height: `${20 + i * 4}px` }}
            />
          );
        })}
        <div className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100">
          <span className="text-lg">
            {position >= max ? "💀" : `${max - position}`}
          </span>
        </div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {max - position} mistakes remaining
      </p>
    </div>
  );
}
