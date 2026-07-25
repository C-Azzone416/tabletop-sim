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

    const { result } = renderHook(() => useMissionOutcomes("p1", "Alice"));

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

    renderHook(() => useMissionOutcomes("", "Alice"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays empty (does not throw) when the fetch fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMissionOutcomes("p1", "Alice"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(result.current).toEqual({});
  });

  it("stays empty when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMissionOutcomes("p1", "Alice"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(result.current).toEqual({});
  });

  // #222 — the route is now own-profile-gated; the client must send
  // credentials as query params (same #194 pattern as useWebSocket) and
  // handle both failure shapes rather than assuming just one.
  describe("credentialed requests (#222)", () => {
    it("sends profileId and name as query params", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ outcomes: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      renderHook(() => useMissionOutcomes("p1", "Alice"));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/profiles/p1/mission-outcomes?");
      const query = new URLSearchParams(url.split("?")[1]);
      expect(query.get("profileId")).toBe("p1");
      expect(query.get("name")).toBe("Alice");
    });

    it("stays empty (does not throw) on a 401 — credentials didn't resolve", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal("fetch", fetchMock);

      const { result } = renderHook(() => useMissionOutcomes("p1", "Alice"));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      expect(result.current).toEqual({});
    });

    it("stays empty (does not throw) on a 403 — credentials resolved to a different profile", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      vi.stubGlobal("fetch", fetchMock);

      const { result } = renderHook(() => useMissionOutcomes("p1", "Alice"));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      expect(result.current).toEqual({});
    });

    it("still fetches (without a name param) when playerName is not yet available", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ outcomes: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      renderHook(() => useMissionOutcomes("p1"));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      const url = fetchMock.mock.calls[0][0] as string;
      const query = new URLSearchParams(url.split("?")[1]);
      expect(query.get("profileId")).toBe("p1");
      expect(query.has("name")).toBe(false);
    });
  });
});
