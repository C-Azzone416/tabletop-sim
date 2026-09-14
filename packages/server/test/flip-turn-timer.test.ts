import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scheduleFlipTurnTimeout,
  cancelFlipTurnTimeout,
  hasFlipTurnTimeout,
} from "../src/ws/flip-turn-timer.js";

describe("flip-turn-timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Belt and suspenders: cancel anything a test left armed so a later
    // test file's real timers can't be polluted by a fake-timer leftover.
    cancelFlipTurnTimeout("g1");
    vi.useRealTimers();
  });

  it("fires onFire after delayMs", () => {
    const onFire = vi.fn();
    scheduleFlipTurnTimeout("g1", 1000, onFire);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("does not fire before delayMs elapses", () => {
    const onFire = vi.fn();
    scheduleFlipTurnTimeout("g1", 1000, onFire);
    vi.advanceTimersByTime(999);
    expect(onFire).not.toHaveBeenCalled();
  });

  it("cancelling before it fires prevents onFire from ever running", () => {
    const onFire = vi.fn();
    scheduleFlipTurnTimeout("g1", 1000, onFire);
    cancelFlipTurnTimeout("g1");
    vi.advanceTimersByTime(10_000);
    expect(onFire).not.toHaveBeenCalled();
  });

  it("cancel returns whether a timer was actually armed", () => {
    expect(cancelFlipTurnTimeout("g1")).toBe(false);
    scheduleFlipTurnTimeout("g1", 1000, vi.fn());
    expect(cancelFlipTurnTimeout("g1")).toBe(true);
    expect(cancelFlipTurnTimeout("g1")).toBe(false); // already consumed
  });

  it("scheduling again for the same gameId replaces the earlier timer, not stacks it", () => {
    const first = vi.fn();
    const second = vi.fn();
    scheduleFlipTurnTimeout("g1", 1000, first);
    scheduleFlipTurnTimeout("g1", 1000, second);
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("tracks armed state per gameId independently", () => {
    scheduleFlipTurnTimeout("g1", 1000, vi.fn());
    expect(hasFlipTurnTimeout("g1")).toBe(true);
    expect(hasFlipTurnTimeout("g2")).toBe(false);
    cancelFlipTurnTimeout("g1");
  });

  it("firing clears the armed state (a fired timer is not still 'armed')", () => {
    scheduleFlipTurnTimeout("g1", 1000, vi.fn());
    vi.advanceTimersByTime(1000);
    expect(hasFlipTurnTimeout("g1")).toBe(false);
  });
});
