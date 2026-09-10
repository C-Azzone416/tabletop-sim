"use client";

/**
 * The visible half of contract C4. Platform-owned, game-agnostic — see
 * useTurnCountdown for why this isn't under app/components/flip.
 */
export interface TurnCountdownProps {
  secondsRemaining: number | null;
}

export function TurnCountdown({ secondsRemaining }: TurnCountdownProps) {
  if (secondsRemaining === null) return null;

  const urgent = secondsRemaining <= 3;

  return (
    <p
      role="timer"
      aria-live={urgent ? "assertive" : "polite"}
      data-testid="turn-countdown"
      className={`tabular text-center text-sm font-medium ${urgent ? "text-danger" : "text-ink-muted"}`}
    >
      {secondsRemaining}s
    </p>
  );
}
