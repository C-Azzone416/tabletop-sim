import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "../app/page";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

// Captures the onMessage callback passed into useWebSocket so tests can
// drive it directly, matching how message routing actually happens.
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
  }),
}));

function setSession(user: { id: string; name: string } | null, status: string) {
  mockUseSession.mockReturnValue({
    data: user ? { user } : null,
    status,
  });
}

describe("Home (app/page.tsx)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnMessage = null;
    mockWsStatus = "disconnected";
    mockGameStateError = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("session loading state", () => {
    it("renders nothing while session status is loading", () => {
      setSession(null, "loading");
      const { container } = render(<Home />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("unauthenticated landing page", () => {
    beforeEach(() => {
      setSession(null, "unauthenticated");
    });

    it("shows the landing page with a Join button, not the sign-in form", () => {
      render(<Home />);
      expect(screen.getByText("Tabletop Simulator")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Choose your name")).not.toBeInTheDocument();
    });

    it("expands the sign-in form when Join is clicked", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
      expect(screen.getByPlaceholderText("Choose your name")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Enter the Room" })).toBeInTheDocument();
    });

    it("disables the submit button until a name is entered", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
      const submit = screen.getByRole("button", { name: "Enter the Room" });
      expect(submit).toBeDisabled();

      fireEvent.change(screen.getByPlaceholderText("Choose your name"), {
        target: { value: "Alice" },
      });
      expect(submit).not.toBeDisabled();
    });

    it("signs in successfully and refreshes the router", async () => {
      mockSignIn.mockResolvedValue({ error: undefined });
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "Join" }));
      await user.type(screen.getByPlaceholderText("Choose your name"), "Alice");
      await user.click(screen.getByRole("button", { name: "Enter the Room" }));

      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        name: "Alice",
        redirect: false,
      });
      expect(mockRefresh).toHaveBeenCalled();
      expect(screen.queryByText("Could not sign in. Please try a different name.")).not.toBeInTheDocument();
    });

    it("shows an error message when sign-in fails", async () => {
      mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "Join" }));
      await user.type(screen.getByPlaceholderText("Choose your name"), "Alice");
      await user.click(screen.getByRole("button", { name: "Enter the Room" }));

      expect(
        await screen.findByText("Could not sign in. Please try a different name."),
      ).toBeInTheDocument();
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("does not submit when name is only whitespace", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
      fireEvent.change(screen.getByPlaceholderText("Choose your name"), {
        target: { value: "   " },
      });
      const submit = screen.getByRole("button", { name: "Enter the Room" });
      expect(submit).toBeDisabled();
    });
  });

  describe("authenticated lobby", () => {
    beforeEach(() => {
      setSession({ id: "profile-1", name: "Alice" }, "authenticated");
    });

    it("renders the lobby with the player's name", () => {
      render(<Home />);
      expect(screen.getByText("Playing as")).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start Spades" })).toBeInTheDocument();
    });

    it("signs out when Change name is clicked", () => {
      render(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Change name" }));
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    });

    it("shows the connecting indicator when ws status is connecting", () => {
      mockWsStatus = "connecting";
      render(<Home />);
      expect(screen.getByText("Connecting to server...")).toBeInTheDocument();
    });

    it("shows a game-state error banner when present", () => {
      mockGameStateError = "Something went wrong";
      render(<Home />);
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    describe("create game", () => {
      it("routes Spades directly to the playable table without creating a wire room", () => {
        render(<Home />);
        fireEvent.click(screen.getByRole("button", { name: "Start Spades" }));

        expect(mockPush).toHaveBeenCalledWith("/spades/hot-seat");
        expect(mockSend).not.toHaveBeenCalled();
        expect(mockConnect).not.toHaveBeenCalled();
      });

      it("can preserve and create the existing wire game", () => {
        render(<Home />);
        fireEvent.click(screen.getByRole("button", { name: /Wire Game/ }));
        fireEvent.click(screen.getByRole("button", { name: "Create Wire Game" }));

        expect(mockSend).toHaveBeenCalledWith({
          type: "create_game",
          playerName: "Alice",
          gameType: "wire-game",
        });
        expect(mockConnect).toHaveBeenCalled();
      });

      it("disables the Join button once creating", () => {
        render(<Home />);
        fireEvent.change(screen.getByPlaceholderText("Enter code"), {
          target: { value: "ABC123" },
        });
        fireEvent.click(screen.getByRole("button", { name: /Wire Game/ }));
        fireEvent.click(screen.getByRole("button", { name: "Create Wire Game" }));
        expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
      });

      it("reverts to idle with an error after a 10s server timeout", () => {
        vi.useFakeTimers();
        render(<Home />);
        fireEvent.click(screen.getByRole("button", { name: /Wire Game/ }));
        fireEvent.click(screen.getByRole("button", { name: "Create Wire Game" }));
        expect(screen.getByRole("button", { name: "Creating..." })).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(10_000);
        });

        expect(screen.getByRole("button", { name: "Create Wire Game" })).not.toBeDisabled();
        expect(
          screen.getByText("Server did not respond. Please try again."),
        ).toBeInTheDocument();
      });

      it("routes to the game page when a game_created message arrives", () => {
        render(<Home />);
        fireEvent.click(screen.getByRole("button", { name: /Wire Game/ }));
        fireEvent.click(screen.getByRole("button", { name: "Create Wire Game" }));

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
    });

    describe("join game", () => {
      it("disables the Join button when the code is empty", () => {
        render(<Home />);
        expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
      });

      it("enables the Join button once a code is entered, and uppercases it", () => {
        render(<Home />);
        const input = screen.getByPlaceholderText("Enter code") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "abc123" } });
        expect(input.value).toBe("ABC123");
        expect(screen.getByRole("button", { name: "Join" })).not.toBeDisabled();
      });

      it("sends join_game and connects on click", () => {
        render(<Home />);
        fireEvent.change(screen.getByPlaceholderText("Enter code"), {
          target: { value: "abc123" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Join" }));

        expect(mockSend).toHaveBeenCalledWith({
          type: "join_game",
          joinCode: "ABC123",
          playerName: "Alice",
        });
        expect(mockConnect).toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Joining..." })).toBeDisabled();
      });

      it("disables the Create button once joining", () => {
        render(<Home />);
        fireEvent.change(screen.getByPlaceholderText("Enter code"), {
          target: { value: "ABC123" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Join" }));
        expect(screen.getByRole("button", { name: "Start Spades" })).toBeDisabled();
      });

      it("routes to the game page when a joined_game message arrives", () => {
        render(<Home />);
        fireEvent.change(screen.getByPlaceholderText("Enter code"), {
          target: { value: "ABC123" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Join" }));

        act(() => {
          capturedOnMessage?.({
            type: "joined_game",
            game: { joinCode: "ABC123" },
            player: { id: "p2", name: "Alice" },
            players: [],
          });
        });

        expect(mockPush).toHaveBeenCalledWith("/game/ABC123");
      });
    });

    describe("server error routing", () => {
      it("resets mode to idle when the server sends an error message", () => {
        render(<Home />);
        fireEvent.click(screen.getByRole("button", { name: /Wire Game/ }));
        fireEvent.click(screen.getByRole("button", { name: "Create Wire Game" }));
        expect(screen.getByRole("button", { name: "Creating..." })).toBeInTheDocument();

        act(() => {
          capturedOnMessage?.({ type: "error", message: "Game not found" });
        });

        expect(screen.getByRole("button", { name: "Create Wire Game" })).not.toBeDisabled();
      });
    });
  });
});
