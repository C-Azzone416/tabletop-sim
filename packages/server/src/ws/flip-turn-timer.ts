// #394 (Contract C4) — the server-side half of the turn timeout guarantee.
//
// Mirrors connection-manager.ts's schedulePendingLeave/cancelPendingLeave
// pattern (same in-memory Map-of-timers shape), but keyed by gameId rather
// than playerId: a Flip game has at most one live turn/pending-action at a
// time, so one timer per game is the whole state this needs.
//
// This is what makes the guarantee real rather than a client courtesy: the
// client-side countdown (useTurnCountdown, FlipTable) is what a CONNECTED
// player sees, but a disconnected/crashed/backgrounded client runs no JS at
// all. Without a server-owned timer, "the platform guarantees the timeout"
// (C4) would only be true for players who happen to be watching.

const flipTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Arms a turn-expiry timer for `gameId`, replacing any timer already armed
 * for it. `onFire` runs once, after `delayMs`, unless
 * {@link cancelFlipTurnTimeout} is called first.
 */
export function scheduleFlipTurnTimeout(gameId: string, delayMs: number, onFire: () => void | Promise<void>): void {
  cancelFlipTurnTimeout(gameId);
  const timer = setTimeout(() => {
    flipTurnTimers.delete(gameId);
    void onFire();
  }, delayMs);
  flipTurnTimers.set(gameId, timer);
}

/** Cancels the armed turn timer for `gameId`, if one exists. Returns whether one was. */
export function cancelFlipTurnTimeout(gameId: string): boolean {
  const timer = flipTurnTimers.get(gameId);
  if (!timer) return false;
  clearTimeout(timer);
  flipTurnTimers.delete(gameId);
  return true;
}

export function hasFlipTurnTimeout(gameId: string): boolean {
  return flipTurnTimers.has(gameId);
}
