import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import HostSelection from "../app/play/host/page";

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

let capturedOnMessage: ((message: unknown) => void) | null = null;
const mockConnect = vi.fn();
const mockSend = vi.fn();
vi.mock("../app/hooks/useWebSocket", () => ({
  useWebSocket: (onMessage: (message: unknown) => void) => {
    capturedOnMessage = onMessage;
    return { status: "disconnected", connect: mockConnect, send: mockSend };
  },
}));

const mockHandleMessage = vi.fn();
let mockGameStateError: string | null = null;
vi.mock("../app/hooks/useGameState", () => ({
  useGameState: () => ({
    state: { error: mockGameStateError },
    handleMessage: mockHandleMessage,
    clearError: vi.fn(),
  }),
}));

function setSession(user: { id: string; name: string } | null, status: string) {
  mockUseSession.mockReturnValue({
    data: user ? { user } : null,
    status,
  });
}

describe("HostSelection (app/play/host/page.tsx)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnMessage = null;
    mockGameStateError = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing while session is loading", () => {
    setSession(null, "loading");
    const { container } = render(<HostSelection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("redirects to the landing page when unauthenticated", () => {
    setSession(null, "unauthenticated");
    render(<HostSelection />);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  describe("authenticated", () => {
    beforeEach(() => {
      setSession({ id: "profile-1", name: "Alice" }, "authenticated");
    });

    it("lists the registry's games for selection", () => {
      render(<HostSelection />);
      expect(screen.getByText("Wire Game")).toBeInTheDocument();
      expect(screen.getByText("Spades")).toBeInTheDocument();
    });

    it("sends create_game with gameType and connects when an available game is picked", () => {
      render(<HostSelection />);
      fireEvent.click(screen.getByText("Wire Game").closest("button")!);

      expect(mockSend).toHaveBeenCalledWith({
        type: "create_game",
        playerName: "Alice",
        gameType: "wire-game",
      });
      expect(mockConnect).toHaveBeenCalled();
    });

    it("does not send anything when an unavailable game is picked", () => {
      render(<HostSelection />);
      fireEvent.click(screen.getByText("Spades").closest("button")!);
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("routes to the game page when game_created arrives", () => {
      render(<HostSelection />);
      fireEvent.click(screen.getByText("Wire Game").closest("button")!);

      act(() => {
        capturedOnMessage?.({
          type: "game_created",
          game: { joinCode: "XYZ999" },
          player: { id: "p1", name: "Alice" },
        });
      });

      expect(mockHandleMessage).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/game/XYZ999");
    });

    it("returns to a usable state (no silent hang) on a server error", () => {
      render(<HostSelection />);
      fireEvent.click(screen.getByText("Wire Game").closest("button")!);
      expect(screen.getByText("Wire Game").closest("button")).toBeDisabled();

      act(() => {
        capturedOnMessage?.({ type: "error", message: "Could not create game" });
      });

      expect(mockHandleMessage).toHaveBeenCalled();
      expect(screen.getByText("Wire Game").closest("button")).not.toBeDisabled();
    });

    it("shows a game-state error banner when present", () => {
      mockGameStateError = "Could not create game";
      render(<HostSelection />);
      expect(screen.getByText("Could not create game")).toBeInTheDocument();
    });

    it("reverts to idle with an error after a 10s server timeout — no silent hang", () => {
      vi.useFakeTimers();
      render(<HostSelection />);
      fireEvent.click(screen.getByText("Wire Game").closest("button")!);

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(
        screen.getByText("Server did not respond. Please try again."),
      ).toBeInTheDocument();
      expect(screen.getByText("Wire Game").closest("button")).not.toBeDisabled();
    });
  });
});
