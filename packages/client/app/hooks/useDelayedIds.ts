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

  // Pruning ids that dropped out of `ids` (e.g. a reconnect) happens here,
  // during render, rather than as a synchronous setState inside the effect
  // below — the same "adjust state on a prop change" pattern FlipTable.tsx
  // uses for trackedPromptKey. That's not just satisfying the lint rule:
  // it's the fix. A setState in the effect body re-fires the effect (it's
  // keyed on `ids`), so proving it can't cascade means reasoning about the
  // updater's bail-out every time — easy to get wrong later. This form
  // can't cascade *by construction*: the guard compares against the exact
  // key the update sets, so trackedIdsKey === idsKey immediately after,
  // the condition is false on the very next render, and React only ever
  // schedules the one extra render for a real props change (per React's
  // docs: https://react.dev/learn/you-might-not-need-an-effect).
  const idsKey = ids.join(",");
  const [trackedIdsKey, setTrackedIdsKey] = useState(idsKey);
  if (idsKey !== trackedIdsKey) {
    setTrackedIdsKey(idsKey);
    const idSet = new Set(ids);
    setVisible((prev) => {
      const next = prev.filter((id) => idSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }

  // Keyed on ids' CONTENT (a joined string) rather than its reference: the
  // caller's array is freshly derived every render (e.g. from reducer
  // state), so a reference-keyed effect would re-run on every unrelated
  // re-render too.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above.
  }, [ids.join(","), delayMs]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  return visible;
}
