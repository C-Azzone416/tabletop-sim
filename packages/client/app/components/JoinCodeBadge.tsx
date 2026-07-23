interface JoinCodeBadgeProps {
  joinCode: string;
}

export function JoinCodeBadge({ joinCode }: JoinCodeBadgeProps) {
  return (
    <div className="fixed top-4 left-4 z-40 rounded-lg border border-zinc-300 bg-white/90 px-3 py-1.5 text-xs shadow-md backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/90">
      <span className="text-zinc-500 dark:text-zinc-400">Join Code:</span>{" "}
      <span className="font-mono font-semibold tracking-widest text-zinc-900 dark:text-zinc-100">
        {joinCode}
      </span>
    </div>
  );
}
