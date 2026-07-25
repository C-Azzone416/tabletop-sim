import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMissionOutcomes } from "../app/hooks/useMissionOutcomes";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMissionOutcomes (#170)", () => {
  it("fetches outcomes for the given profile and keys them by mission", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        outcomes: [
          { profileId: "p1", mission: 1, outcome: "won", updatedAt: "2026-07-25T00:00:00Z" },
          { profileId: "p1", mission: 2, outcome: "lost", updatedAt: "2026-07-25T00:00:00Z" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMissionOutcomes("p1"));

    await waitFor(() => {
      expect(result.current).toEqual({ 1: "won", 2: "lost" });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/profiles/p1/mission-outcomes"),
    );
  });

  it("does not fetch when profileId is empty", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useMissionOutcomes(""));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays empty (does not throw) when the fetch fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMissionOutcomes("p1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(result.current).toEqual({});
  });

  it("stays empty when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMissionOutcomes("p1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(result.current).toEqual({});
  });
});
