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
});
