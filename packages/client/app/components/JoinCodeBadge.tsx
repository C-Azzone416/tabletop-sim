interface JoinCodeBadgeProps {
  joinCode: string;
}

export function JoinCodeBadge({ joinCode }: JoinCodeBadgeProps) {
  return (
    <div className="fixed top-4 left-4 z-40 rounded-cab border-2 border-outline bg-surface-raised/90 px-3 py-1.5 text-xs shadow-print-sm backdrop-blur-sm">
      <span className="text-ink-muted">Join Code:</span>{" "}
      <span className="font-mono font-semibold tracking-widest text-ink">
        {joinCode}
      </span>
    </div>
  );
}
