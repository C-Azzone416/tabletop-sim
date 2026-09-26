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
const mockDisconnect = vi.fn();
const mockSend = vi.fn();
let mockWsStatus: "connecting" | "connected" | "disconnected" = "disconnected";
vi.mock("../app/hooks/useWebSocket", () => ({
  useWebSocket: (onMessage: (message: unknown) => void) => {
    capturedOnMessage = onMessage;
    return { status: mockWsStatus, connect: mockConnect, disconnect: mockDisconnect, send: mockSend };
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

// #437: picking a game no longer creates the room immediately — it moves to
// a count step on the same screen. Wire Game (2-4) is not fixed-size, so
// these helpers pick a count before confirming, matching the real flow.
function selectWireGame() {
  fireEvent.click(screen.getByText("Wire Game").closest("button")!);
}

function confirmCount(count: number) {
  fireEvent.click(screen.getByRole("button", { name: String(count) }));
  fireEvent.click(screen.getByRole("button", { name: "Create Room" }));
}

describe("HostSelection (app/play/host/page.tsx)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnMessage = null;
    mockGameStateError = null;
    mockWsStatus = "disconnected";
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

    it("picking a game moves to the count step without sending create_game yet", () => {
      render(<HostSelection />);
      selectWireGame();

      expect(mockSend).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Create Room" })).toBeInTheDocument();
    });

    it("← Choose a different game returns to the grid", () => {
      render(<HostSelection />);
      selectWireGame();
      fireEvent.click(screen.getByText("← Choose a different game"));

      expect(screen.getByText("Spades")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create Room" })).not.toBeInTheDocument();
    });

    it("sends create_game with the chosen gameType and maxPlayers, and connects", () => {
      render(<HostSelection />);
      selectWireGame();
      confirmCount(3);

      expect(mockSend).toHaveBeenCalledWith({
        type: "create_game",
        playerName: "Alice",
        gameType: "wire-game",
        maxPlayers: 3,
      });
      expect(mockConnect).toHaveBeenCalled();
    });

    it("offers both online-room and hot-seat launches for Spades", () => {
      render(<HostSelection />);
      fireEvent.click(screen.getByText("Spades").closest("button")!);
      expect(screen.getByRole("button", { name: "Create Online Room" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Play Hot Seat" })).toBeInTheDocument();
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("creates a four-seat online Spades room", () => {
      render(<HostSelection />);
      fireEvent.click(screen.getByText("Spades").closest("button")!);
      fireEvent.click(screen.getByRole("button", { name: "Create Online Room" }));
      expect(mockSend).toHaveBeenCalledWith({
        type: "create_game",
        playerName: "Alice",
        gameType: "spades",
        maxPlayers: 4,
      });
      expect(mockConnect).toHaveBeenCalled();
    });

    it("still routes Spades hot-seat to the local table", () => {
      render(<HostSelection />);
      fireEvent.click(screen.getByText("Spades").closest("button")!);
      fireEvent.click(screen.getByRole("button", { name: "Play Hot Seat" }));
      expect(mockPush).toHaveBeenCalledWith("/spades/hot-seat");
    });

    it("routes to the game page when game_created arrives", () => {
      render(<HostSelection />);
      selectWireGame();
      confirmCount(4);

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
      selectWireGame();
      confirmCount(4);
      expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();

      act(() => {
        capturedOnMessage?.({ type: "error", message: "Could not create game" });
      });

      expect(mockHandleMessage).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Create Room" })).not.toBeDisabled();
    });

    it("shows the connecting indicator when the WebSocket status is connecting (#318 relocation)", () => {
      mockWsStatus = "connecting";
      render(<HostSelection />);
      expect(screen.getByText("Connecting to server...")).toBeInTheDocument();
    });

    // #336 — the positive test above only proves the indicator CAN render;
    // nothing previously proved it does not render outside "connecting".
    // Confirmed via mutation: replacing the condition with `true` (so the
    // indicator renders permanently, in every status) left the whole file
    // passing beforehand. These pin the other two statuses explicitly.
    it("does not show the connecting indicator when disconnected (#336)", () => {
      mockWsStatus = "disconnected";
      render(<HostSelection />);
      expect(screen.queryByText("Connecting to server...")).not.toBeInTheDocument();
    });

    it("does not show the connecting indicator once connected (#336)", () => {
      mockWsStatus = "connected";
      render(<HostSelection />);
      expect(screen.queryByText("Connecting to server...")).not.toBeInTheDocument();
    });

    it("shows a game-state error banner when present", () => {
      mockGameStateError = "Could not create game";
      render(<HostSelection />);
      expect(screen.getByText("Could not create game")).toBeInTheDocument();
    });

    it("reverts to idle with an error after a 10s server timeout — no silent hang", () => {
      vi.useFakeTimers();
      render(<HostSelection />);
      selectWireGame();
      confirmCount(4);

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(
        screen.getByText("Server did not respond. Please try again."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create Room" })).not.toBeDisabled();
    });

    it("offers ← Back to /play (#335/#355: adopted PlayScreen chrome)", () => {
      render(<HostSelection />);
      expect(screen.getByRole("link", { name: /← Back/ })).toHaveAttribute("href", "/play");
    });
  });
});
