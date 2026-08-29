import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlayAction, usePlaySessionGuard } from "../app/play/usePlayAction";
import { useActionTimeout, ACTION_TIMEOUT_MS } from "../app/play/useActionTimeout";

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

// Captures the onMessage callback so tests can drive server messages the way
// the socket actually would (same approach as test/page.test.tsx).
let capturedOnMessage: ((message: unknown) => void) | null = null;
const mockConnect = vi.fn();
const mockSend = vi.fn();
vi.mock("../app/hooks/useWebSocket", () => ({
  useWebSocket: (onMessage: (message: unknown) => void) => {
    capturedOnMessage = onMessage;
    return { status: "disconnected", connect: mockConnect, send: mockSend };
  },
}));

function setSession(user: { id: string; name: string } | null, status: string) {
  mockUseSession.mockReturnValue({ data: user ? { user } : null, status });
}

const SIGNED_IN = { id: "profile-1", name: "Ada" };

describe("useActionTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the callback after the shared 10s window", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useActionTimeout(onTimeout));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(ACTION_TIMEOUT_MS - 1));
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(ACTION_TIMEOUT_MS).toBe(10_000);
  });

  it("does not fire once cleared, and restarting replaces the pending timer", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useActionTimeout(onTimeout));

    act(() => result.current.start());
    act(() => result.current.clear());
    act(() => vi.advanceTimersByTime(ACTION_TIMEOUT_MS * 2));
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(ACTION_TIMEOUT_MS / 2));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(ACTION_TIMEOUT_MS / 2));
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(ACTION_TIMEOUT_MS / 2));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not fire after unmount", () => {
    const onTimeout = vi.fn();
    const { result, unmount } = renderHook(() => useActionTimeout(onTimeout));

    act(() => result.current.start());
    unmount();
    act(() => vi.advanceTimersByTime(ACTION_TIMEOUT_MS * 2));
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe("usePlayAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnMessage = null;
    setSession(SIGNED_IN, "authenticated");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("create branch", () => {
    it("sends create_game, connects and reports the creating mode", () => {
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        result.current.createGame();
      });

      expect(mockSend).toHaveBeenCalledWith({ type: "create_game", playerName: "Ada" });
      expect(mockConnect).toHaveBeenCalled();
      expect(result.current.mode).toBe("creating");
      expect(result.current.isBusy).toBe(true);
    });

    it("routes to the game on game_created", () => {
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        result.current.createGame();
      });
      act(() => {
        capturedOnMessage?.({ type: "game_created", game: { joinCode: "ABC123" } });
      });

      expect(mockPush).toHaveBeenCalledWith("/game/ABC123");
    });
  });

  describe("join branch", () => {
    it("upper-cases and trims the code, sends join_game and reports joining", () => {
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        result.current.joinGame("  abc123 ");
      });

      expect(mockSend).toHaveBeenCalledWith({
        type: "join_game",
        joinCode: "ABC123",
        playerName: "Ada",
      });
      expect(result.current.mode).toBe("joining");
    });

    it("ignores an empty code", () => {
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        expect(result.current.joinGame("   ")).toBe(false);
      });

      expect(mockSend).not.toHaveBeenCalled();
      expect(result.current.mode).toBe("idle");
    });

    it("routes to the game on joined_game", () => {
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        result.current.joinGame("ABC123");
      });
      act(() => {
        capturedOnMessage?.({ type: "joined_game", game: { joinCode: "ABC123" } });
      });

      expect(mockPush).toHaveBeenCalledWith("/game/ABC123");
    });
  });

  describe("failure handling shared by both branches", () => {
    it.each([
      ["creating", (r: ReturnType<typeof usePlayAction>) => r.createGame()],
      ["joining", (r: ReturnType<typeof usePlayAction>) => r.joinGame("ABC123")],
    ])("returns to idle with a message when %s times out", (expectedMode, start) => {
      vi.useFakeTimers();
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        start(result.current);
      });
      expect(result.current.mode).toBe(expectedMode);

      act(() => {
        vi.advanceTimersByTime(ACTION_TIMEOUT_MS);
      });

      expect(result.current.mode).toBe("idle");
      expect(result.current.errorMessage).toBe("Server did not respond. Please try again.");
    });

    it("returns to idle and surfaces a server error, and does not then time out", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        result.current.createGame();
      });
      act(() => {
        capturedOnMessage?.({ type: "error", message: "Game not found" });
      });

      expect(result.current.mode).toBe("idle");
      expect(result.current.errorMessage).toBe("Game not found");

      act(() => {
        vi.advanceTimersByTime(ACTION_TIMEOUT_MS * 2);
      });
      // The timeout copy must not clobber the specific server message.
      expect(result.current.errorMessage).toBe("Game not found");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("clears the timeout on success so a late timer cannot fire", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        result.current.createGame();
      });
      act(() => {
        capturedOnMessage?.({ type: "game_created", game: { joinCode: "ABC123" } });
      });
      act(() => {
        vi.advanceTimersByTime(ACTION_TIMEOUT_MS * 2);
      });

      expect(result.current.errorMessage).toBeFalsy();
    });

    it("dismissError clears both the action error and the game-state error", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        result.current.createGame();
      });
      act(() => {
        vi.advanceTimersByTime(ACTION_TIMEOUT_MS);
      });
      expect(result.current.errorMessage).toBeTruthy();

      act(() => {
        result.current.dismissError();
      });
      expect(result.current.errorMessage).toBeFalsy();
    });

    it("refuses a second action while one is in flight", () => {
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        result.current.createGame();
      });
      act(() => {
        expect(result.current.joinGame("ABC123")).toBe(false);
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("sends nothing when there is no signed-in player name", () => {
      setSession(null, "unauthenticated");
      const { result } = renderHook(() => usePlayAction());

      act(() => {
        expect(result.current.createGame()).toBe(false);
      });

      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});

describe("usePlaySessionGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits while the session is loading", () => {
    setSession(null, "loading");
    const { result } = renderHook(() => usePlaySessionGuard());

    expect(result.current).toBe("loading");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("is ready for a signed-in player and does not redirect", () => {
    setSession(SIGNED_IN, "authenticated");
    const { result } = renderHook(() => usePlaySessionGuard());

    expect(result.current).toBe("ready");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor back to the landing page, where sign-in lives", () => {
    setSession(null, "unauthenticated");
    const { result } = renderHook(() => usePlaySessionGuard());

    expect(result.current).toBe("redirecting");
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
