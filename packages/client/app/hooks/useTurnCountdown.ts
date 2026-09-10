"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Contract C4 (DESIGN-APPENDIX §2b): "the platform guarantees a timeout
 * exists, is announced with a visible countdown started >=10s earlier, and
 * never silently forfeits." Platform-level and game-agnostic on purpose —
 * every game with turns needs this, not just Flip (#366's issue happens to
 * be filed under the Flip epic, but nothing here is Flip-specific; the
 * default *action* taken on expiry is the game's job, not this hook's).
 *
 * Deliberately separate from useActionTimeout (app/play/useActionTimeout.ts):
 * that one is a single-shot "did the server ack my action" timer with no
 * visible display. This one is a ticking, visible turn clock driven by an
 * absolute deadline (so it survives a re-render / stays correct across a
 * reconnect, unlike a relative setTimeout re-armed on mount).
 */
export interface UseTurnCountdownOptions {
  /** Epoch ms the current prompt expires at, or null when nothing is timed. */
  deadline: number | null;
  onExpire: () => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

function remainingMs(deadline: number | null, now: () => number): number | null {
  return deadline === null ? null : Math.max(0, deadline - now());
}

export function useTurnCountdown({ deadline, onExpire, now = Date.now }: UseTurnCountdownOptions) {
  const [msRemaining, setMsRemaining] = useState(() => remainingMs(deadline, now));
  const [trackedDeadline, setTrackedDeadline] = useState(deadline);

  // A new deadline (new prompt) resyncs the displayed value immediately,
  // ahead of the next paint — the React-endorsed "adjust state while
  // rendering" pattern, not a setState-in-effect: https://react.dev/learn/you-might-not-need-an-effect
  if (deadline !== trackedDeadline) {
    setTrackedDeadline(deadline);
    setMsRemaining(remainingMs(deadline, now));
  }

  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (deadline === null) return;

    const intervalId = setInterval(() => {
      const remaining = remainingMs(deadline, now);
      setMsRemaining(remaining);
      if (remaining !== null && remaining <= 0) {
        clearInterval(intervalId);
        onExpireRef.current();
      }
    }, 250);

    return () => clearInterval(intervalId);
  }, [deadline, now]);

  return {
    secondsRemaining: msRemaining === null ? null : Math.ceil(msRemaining / 1000),
  };
}
