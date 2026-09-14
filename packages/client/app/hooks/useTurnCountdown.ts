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
 *
 * #448 — the turn timer's relationship to #446's disconnect grace window,
 * decided rather than left to fall out of whatever happened to compile:
 * IT KEEPS RUNNING, unpaused and unextended, if the active player is the
 * one inside the grace window. Not a design gap — a deliberate choice,
 * for the same reason the grace window itself shows the seat as present
 * rather than vanished: the player has not left, so their turn is still
 * genuinely theirs, and this hook's existing behavior (an absolute
 * `deadline`, not a relative timer reset on reconnect) already does
 * exactly the right thing with zero special-casing. Pausing it would mean
 * every OTHER player waits on a clock that might never resume for someone
 * who may not come back — directly against Contract C4's "never silently
 * forfeits": a paused-forever timer IS a silent forfeit, just a slower
 * one. If they reconnect before it expires, they act normally. If it
 * expires first, the game's own C4 default action fires exactly as it
 * would for any other unresponsive turn — the correct fallback already
 * exists and needs no #446-specific exception.
 */
export interface UseTurnCountdownOptions {
  /** Epoch ms the current prompt expires at, or null when nothing is timed. */
  deadline: number | null;
  onExpire: () => void;
  /** Injectable clock for tests. */
  now?: () => number;
  /**
   * #394 — C4 only requires the countdown be VISIBLE for the final ≥10s
   * before it fires; it does not require showing it for the whole
   * duration. A caller with a duration much longer than that floor (Flip:
   * 45s total, 15s visible per Caroline's ruling) sets this to hold
   * `secondsRemaining` at `null` — hiding the number, not affecting
   * anything else — until this many ms are actually left. The timer that
   * drives `onExpire` runs for the FULL duration regardless; this only
   * gates what's rendered. Omit to show continuously from the moment a
   * deadline exists, the previous behavior (correct for a caller whose
   * whole duration already fits inside its own visible window).
   */
  visibleForMs?: number;
}

function remainingMs(deadline: number | null, now: () => number): number | null {
  return deadline === null ? null : Math.max(0, deadline - now());
}

export function useTurnCountdown({ deadline, onExpire, now = Date.now, visibleForMs }: UseTurnCountdownOptions) {
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

  // #394 — the visibility gate. Computed from state, not tracked
  // separately: msRemaining already ticks every 250ms above, so this needs
  // no timer of its own to flip from hidden to visible at the right moment.
  const withinVisibleWindow = visibleForMs === undefined || msRemaining === null || msRemaining <= visibleForMs;

  return {
    secondsRemaining: msRemaining === null || !withinVisibleWindow ? null : Math.ceil(msRemaining / 1000),
  };
}
