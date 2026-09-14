import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTurnCountdown } from "../app/hooks/useTurnCountdown";

describe("useTurnCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns null seconds when there is no deadline", () => {
    const { result } = renderHook(() => useTurnCountdown({ deadline: null, onExpire: vi.fn() }));
    expect(result.current.secondsRemaining).toBeNull();
  });

  it("counts down toward the deadline", () => {
    const start = 1_000_000;
    let clock = start;
    const now = () => clock;
    const { result } = renderHook(() =>
      useTurnCountdown({ deadline: start + 10_000, onExpire: vi.fn(), now }),
    );
    expect(result.current.secondsRemaining).toBe(10);

    clock = start + 4_000;
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.secondsRemaining).toBe(6);
  });

  it("calls onExpire exactly once when the deadline passes, never before", () => {
    const start = 1_000_000;
    let clock = start;
    const now = () => clock;
    const onExpire = vi.fn();
    renderHook(() => useTurnCountdown({ deadline: start + 1_000, onExpire, now }));

    clock = start + 500;
    act(() => vi.advanceTimersByTime(250));
    expect(onExpire).not.toHaveBeenCalled();

    clock = start + 1_500;
    act(() => vi.advanceTimersByTime(250));
    expect(onExpire).toHaveBeenCalledTimes(1);

    // The interval must stop firing after expiry — no repeated calls.
    act(() => vi.advanceTimersByTime(2_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("restarts cleanly when the deadline prop changes (new prompt)", () => {
    const start = 1_000_000;
    let clock = start;
    const now = () => clock;
    const onExpire = vi.fn();
    const { result, rerender } = renderHook(
      ({ deadline }) => useTurnCountdown({ deadline, onExpire, now }),
      { initialProps: { deadline: start + 1_000 as number | null } },
    );

    clock = start + 1_500;
    act(() => vi.advanceTimersByTime(250));
    expect(onExpire).toHaveBeenCalledTimes(1);

    rerender({ deadline: start + 1_500 + 5_000 });
    expect(result.current.secondsRemaining).toBe(5);

    act(() => vi.advanceTimersByTime(250));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  // #394 — C4 only requires the countdown be visible for the final >=10s,
  // not the whole duration. Flip's ruled shape (45s total, 15s visible) is
  // the caller-supplied case this proves, but the mechanism is generic.
  describe("visibleForMs — hides the number outside the visible window", () => {
    it("stays null while more than visibleForMs remains, even though a deadline exists", () => {
      const start = 1_000_000;
      let clock = start;
      const now = () => clock;
      const { result } = renderHook(() =>
        useTurnCountdown({ deadline: start + 45_000, onExpire: vi.fn(), now, visibleForMs: 15_000 }),
      );
      // 45s left, window is the final 15s — must not show yet.
      expect(result.current.secondsRemaining).toBeNull();

      clock = start + 20_000; // 25s left — still outside the 15s window
      act(() => vi.advanceTimersByTime(250));
      expect(result.current.secondsRemaining).toBeNull();
    });

    it("becomes visible the instant the remaining time crosses into visibleForMs", () => {
      const start = 1_000_000;
      let clock = start;
      const now = () => clock;
      const { result } = renderHook(() =>
        useTurnCountdown({ deadline: start + 45_000, onExpire: vi.fn(), now, visibleForMs: 15_000 }),
      );

      clock = start + 30_000; // exactly 15s left — the boundary itself is visible
      act(() => vi.advanceTimersByTime(250));
      expect(result.current.secondsRemaining).toBe(15);

      clock = start + 32_000; // 13s left
      act(() => vi.advanceTimersByTime(250));
      expect(result.current.secondsRemaining).toBe(13);
    });

    it("still fires onExpire at the real deadline — the visibility gate never delays the timer itself", () => {
      const start = 1_000_000;
      let clock = start;
      const now = () => clock;
      const onExpire = vi.fn();
      renderHook(() =>
        useTurnCountdown({ deadline: start + 45_000, onExpire, now, visibleForMs: 15_000 }),
      );

      clock = start + 44_999; // hidden the whole time, but expiry is still imminent
      act(() => vi.advanceTimersByTime(250));
      expect(onExpire).not.toHaveBeenCalled();

      clock = start + 45_500;
      act(() => vi.advanceTimersByTime(250));
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it("without visibleForMs, shows continuously from the moment a deadline exists (unchanged default)", () => {
      const start = 1_000_000;
      const { result } = renderHook(() =>
        useTurnCountdown({ deadline: start + 45_000, onExpire: vi.fn(), now: () => start }),
      );
      expect(result.current.secondsRemaining).toBe(45);
    });
  });
});
