import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import JoinByCode from "../app/play/join/page";

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
let mockWsStatus: "connecting" | "connected" | "disconnected" = "disconnected";
vi.mock("../app/hooks/useWebSocket", () => ({
  useWebSocket: (onMessage: (message: unknown) => void) => {
    capturedOnMessage = onMessage;
    return { status: mockWsStatus, connect: mockConnect, send: mockSend };
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

function typeCode(code: string) {
  fireEvent.change(screen.getByPlaceholderText("Enter code"), {
    target: { value: code },
  });
}

describe("JoinByCode (app/play/join/page.tsx)", () => {
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
    const { container } = render(<JoinByCode />);
    expect(container).toBeEmptyDOMElement();
  });

  it("redirects to the landing page when unauthenticated", () => {
    setSession(null, "unauthenticated");
    render(<JoinByCode />);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  describe("authenticated", () => {
    beforeEach(() => {
      setSession({ id: "profile-1", name: "Alice" }, "authenticated");
    });

    it("disables Join until a code is entered", () => {
      render(<JoinByCode />);
      expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
    });

    it("uppercases input as it's typed", () => {
      render(<JoinByCode />);
      const input = screen.getByPlaceholderText("Enter code") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "abc123" } });
      expect(input.value).toBe("ABC123");
    });

    it("is forgiving of lowercase and surrounding whitespace on submit", () => {
      render(<JoinByCode />);
      typeCode("  abcdef  ");
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
      expect(mockSend).toHaveBeenCalledWith({
        type: "join_game",
        joinCode: "ABCDEF",
        playerName: "Alice",
      });
    });

    it("sends join_game and connects for a well-formed code", () => {
      render(<JoinByCode />);
      typeCode("ABCDEF");
      fireEvent.click(screen.getByRole("button", { name: "Join" }));

      expect(mockSend).toHaveBeenCalledWith({
        type: "join_game",
        joinCode: "ABCDEF",
        playerName: "Alice",
      });
      expect(mockConnect).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Joining..." })).toBeDisabled();
    });

    it("routes to the game page when joined_game arrives", () => {
      render(<JoinByCode />);
      typeCode("ABCDEF");
      fireEvent.click(screen.getByRole("button", { name: "Join" }));

      act(() => {
        capturedOnMessage?.({
          type: "joined_game",
          game: { joinCode: "ABCDEF" },
          player: { id: "p2", name: "Alice" },
          players: [],
        });
      });

      expect(mockHandleMessage).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/game/ABCDEF");
    });

    describe("malformed code — caught client-side before a round trip", () => {
      it("rejects a code of the wrong length without sending or connecting", () => {
        render(<JoinByCode />);
        typeCode("ABC");
        fireEvent.click(screen.getByRole("button", { name: "Join" }));

        expect(mockSend).not.toHaveBeenCalled();
        expect(mockConnect).not.toHaveBeenCalled();
        expect(
          screen.getByText("That code doesn't look right. Check it and try again."),
        ).toBeInTheDocument();
      });

      it("rejects a code with characters outside the server's alphabet", () => {
        render(<JoinByCode />);
        typeCode("ABCDEI");
        fireEvent.click(screen.getByRole("button", { name: "Join" }));

        expect(mockSend).not.toHaveBeenCalled();
        expect(mockConnect).not.toHaveBeenCalled();
      });
    });

    describe("server-distinguished error states", () => {
      it.each([
        ["Game not found", "code does not exist"],
        ["Game already started", "game already started"],
        ["Game is full", "room is full"],
      ])("surfaces %j from the server (%s)", (serverMessage) => {
        render(<JoinByCode />);
        typeCode("ABCDEF");
        fireEvent.click(screen.getByRole("button", { name: "Join" }));

        mockGameStateError = serverMessage;
        act(() => {
          capturedOnMessage?.({ type: "error", message: serverMessage });
        });

        expect(mockHandleMessage).toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Join" })).not.toBeDisabled();
      });
    });

    it("reverts to idle with an error after a 10s server timeout — no silent hang", () => {
      vi.useFakeTimers();
      render(<JoinByCode />);
      typeCode("ABCDEF");
      fireEvent.click(screen.getByRole("button", { name: "Join" }));

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(
        screen.getByText("Server did not respond. Please try again."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Join" })).not.toBeDisabled();
    });

    it("submits on Enter key", () => {
      render(<JoinByCode />);
      typeCode("ABCDEF");
      fireEvent.keyDown(screen.getByPlaceholderText("Enter code"), { key: "Enter" });
      expect(mockSend).toHaveBeenCalledWith({
        type: "join_game",
        joinCode: "ABCDEF",
        playerName: "Alice",
      });
    });

    it("shows the connecting indicator when the WebSocket status is connecting (#318 relocation)", () => {
      mockWsStatus = "connecting";
      render(<JoinByCode />);
      expect(screen.getByText("Connecting to server...")).toBeInTheDocument();
    });
  });
});
