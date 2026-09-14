import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDelayedIds } from "../app/hooks/useDelayedIds";

describe("useDelayedIds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns nothing before the delay elapses", () => {
    const { result } = renderHook(({ ids }) => useDelayedIds(ids, 2000), {
      initialProps: { ids: ["p1"] },
    });
    expect(result.current).toEqual([]);

    act(() => vi.advanceTimersByTime(1999));
    expect(result.current).toEqual([]);
  });

  it("adds an id once it's been present for the full delay", () => {
    const { result } = renderHook(({ ids }) => useDelayedIds(ids, 2000), {
      initialProps: { ids: ["p1"] },
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toEqual(["p1"]);
  });

  // #448's whole reason to exist: a fast reconnect (a reload, a seat
  // switch, a brief blip) must never flash the indicator at all.
  it("never shows an id that disappears before the delay elapses", () => {
    const { result, rerender } = renderHook(({ ids }) => useDelayedIds(ids, 2000), {
      initialProps: { ids: ["p1"] },
    });

    act(() => vi.advanceTimersByTime(300));
    rerender({ ids: [] }); // reconnected fast
    act(() => vi.advanceTimersByTime(2000));

    expect(result.current).toEqual([]);
  });

  it("removes an id from the visible set once it's no longer in ids, even after it was shown", () => {
    const { result, rerender } = renderHook(({ ids }) => useDelayedIds(ids, 2000), {
      initialProps: { ids: ["p1"] },
    });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toEqual(["p1"]);

    rerender({ ids: [] });
    expect(result.current).toEqual([]);
  });

  it("tracks multiple ids independently, each on its own delay from when it first appeared", () => {
    const { result, rerender } = renderHook(({ ids }) => useDelayedIds(ids, 2000), {
      initialProps: { ids: ["p1"] },
    });

    act(() => vi.advanceTimersByTime(1000));
    rerender({ ids: ["p1", "p2"] }); // p2 joins 1000ms later than p1

    act(() => vi.advanceTimersByTime(1000)); // p1 now at 2000ms, p2 at 1000ms
    expect(result.current).toEqual(["p1"]);

    act(() => vi.advanceTimersByTime(1000)); // p2 now at 2000ms too
    expect(result.current).toContain("p1");
    expect(result.current).toContain("p2");
    expect(result.current).toHaveLength(2);
  });

  it("does not restart an already-visible id's delay on an unrelated rerender", () => {
    const { result, rerender } = renderHook(({ ids }) => useDelayedIds(ids, 2000), {
      initialProps: { ids: ["p1"] },
    });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toEqual(["p1"]);

    // Same ids, new array reference — must not re-trigger anything.
    rerender({ ids: ["p1"] });
    expect(result.current).toEqual(["p1"]);
  });
});
