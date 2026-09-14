"use client";

import { useEffect, useRef, useState } from "react";

/**
 * #448 — delays showing an id until it's been continuously present in
 * `ids` for at least `delayMs`. Returns the SUBSET of `ids` that have
 * cleared the delay.
 *
 * Built for the reconnecting-indicator's own display threshold (a reload,
 * a seat switch, or a brief network blip resolves in well under a second
 * — flashing an indicator for one of those reads as an error where none
 * occurred), but written generically: nothing here knows about
 * reconnecting specifically.
 *
 * An id that disappears from `ids` before its own timer fires (the fast-
 * reconnect case) is silently dropped — it never gets added to the
 * returned set at all, which is the whole point: no flash, not a flash
 * immediately hidden again.
 */
export function useDelayedIds(ids: readonly string[], delayMs: number): readonly string[] {
  const [visible, setVisible] = useState<readonly string[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on ids'
  // CONTENT (a joined string) rather than its reference: the caller's
  // array is freshly derived every render (e.g. from reducer state), so a
  // reference-keyed effect would re-run on every unrelated re-render too.
  useEffect(() => {
    const idSet = new Set(ids);
    const timers = timersRef.current;

    for (const id of idSet) {
      if (!timers.has(id) && !visible.includes(id)) {
        const timer = setTimeout(() => {
          timers.delete(id);
          setVisible((prev) => (prev.includes(id) ? prev : [...prev, id]));
        }, delayMs);
        timers.set(id, timer);
      }
    }

    for (const [id, timer] of timers) {
      if (!idSet.has(id)) {
        clearTimeout(timer);
        timers.delete(id);
      }
    }

    setVisible((prev) => {
      const next = prev.filter((id) => idSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [ids.join(","), delayMs]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  return visible;
}
