"use client";

import { useEffect, useRef } from "react";

const ACTION_TIMEOUT_MS = 10_000;

/**
 * Stopgap copy of the 10s action-timeout behavior currently inline in
 * app/page.tsx (#310/#315 will land a shared version for the /play shell).
 * Same isolated pattern as app/play/host/useActionTimeout.ts (#316) — kept
 * as its own small module so adopting the shared one is a deletion of this
 * file plus its call site, not an untangling.
 */
export function useActionTimeout(onTimeout: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const start = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      onTimeoutRef.current();
    }, ACTION_TIMEOUT_MS);
  };

  const clear = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => clear, []);

  return { start, clear };
}
