"use client";

import { useEffect, useRef } from "react";

/**
 * How long a WebSocket action may hang before we give the player their
 * screen back. Lifted verbatim from the inline value in app/page.tsx (#315);
 * every /play screen shares this one number.
 */
export const ACTION_TIMEOUT_MS = 10_000;

/**
 * Copy shown when an action times out. Kept here so /play/host (#316) and
 * /play/join (#317) cannot drift into three different phrasings.
 */
export const ACTION_TIMEOUT_MESSAGE = "Server did not respond. Please try again.";

/**
 * The 10s action timeout that app/page.tsx owns inline today.
 *
 * This is the shared version PR #323's deliberately isolated copy at
 * app/play/host/useActionTimeout.ts was flagged for: that file is deleted
 * in this change set and /play/host now runs on usePlayAction(), so there
 * is one lifecycle rather than two. Most screens should reach for
 * usePlayAction() rather than this hook directly —
 * this hook is the primitive underneath it, exported for anything that needs
 * the timer without the rest of the WebSocket lifecycle.
 */
export function useActionTimeout(onTimeout: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clear = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const start = () => {
    clear();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      onTimeoutRef.current();
    }, ACTION_TIMEOUT_MS);
  };

  // Unmounting mid-action must not fire a state update on a dead component.
  useEffect(() => clear, []);

  return { start, clear };
}
