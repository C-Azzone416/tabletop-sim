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

// #394 review (weasel/QA) — the stall vector this closes: broadcastFlipGameState
// runs on EVERY broadcast, including a reconnect, which any seated player
// (not just the flipper) can trigger for free and repeatedly by cycling
// their own WebSocket connection. That is necessarily true and correct for
// RE-ARMING THE TIMER CALLBACK (a stale timer scheduled against a turn that
// has since resolved must not fire), but it must NOT be true for the
// DEADLINE VALUE itself — those are two different things the original
// implementation conflated. Re-arming the callback on every broadcast is
// what makes the guarantee reach a disconnected player; advancing the
// deadline on every broadcast is what would let ANY connected player
// indefinitely neutralise it — the mirror image of the silent-forfeit
// problem C4 exists to prevent.
//
// The fix: the deadline is computed ONCE per live turn/pending-action and
// held here, keyed by gameId, alongside a `signature` identifying WHICH
// turn/pending-action it belongs to. A broadcast whose signature matches
// what is already armed (any re-broadcast of the SAME ongoing decision —
// a reconnect, a join, an unrelated player's own action elsewhere) reuses
// the existing deadline verbatim. Only a genuinely NEW turn or pending
// action (a different signature) computes a fresh one. The caller still
// re-arms the setTimeout callback every time — for the time REMAINING
// until this returned deadline, not for a fresh full duration — which is
// what keeps a genuine reconnect by the turn player's own clock running
// correctly (#448's C4 argument) without ever letting it move backward.
interface ArmedTurnDeadline {
  readonly signature: string;
  readonly deadline: number;
}

const armedTurnDeadlines = new Map<string, ArmedTurnDeadline>();

/**
 * The deadline to use for this broadcast: the SAME value already armed for
 * `gameId` if `signature` matches (this is a re-broadcast of the turn/
 * pending-action already being timed), or a fresh `Date.now() + durationMs`
 * if `signature` differs (a genuinely new one). `signature` should identify
 * exactly what is being timed and nothing else — see state-broadcaster.ts's
 * call site for the concrete shape (turnPlayerId + pendingAction.kind).
 */
export function turnDeadlineFor(gameId: string, signature: string, durationMs: number): number {
  const existing = armedTurnDeadlines.get(gameId);
  if (existing && existing.signature === signature) {
    return existing.deadline;
  }
  const deadline = Date.now() + durationMs;
  armedTurnDeadlines.set(gameId, { signature, deadline });
  return deadline;
}

/**
 * Clears the tracked deadline for `gameId` — called whenever there is no
 * live turn/pending-action to time, so the NEXT one (even if it happens to
 * produce the same signature, e.g. the same player's turn again next round)
 * is correctly treated as new rather than matching stale state.
 */
export function clearTurnDeadline(gameId: string): void {
  armedTurnDeadlines.delete(gameId);
}
