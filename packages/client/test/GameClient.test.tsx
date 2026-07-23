import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { GameClient } from "../app/game/[joinCode]/GameClient";
import {
  makeGame,
  makePlayer,
  makeWire,
  resetIds,
} from "./fixtures";
import type { ServerMessage } from "@tabletop/shared";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  simulateMessage(data: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function getWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

describe("GameClient — full game flow integration", () => {
  beforeEach(() => {
    resetIds();
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows lobby state when no game exists yet", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText("Game Lobby")).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });

  it("transitions through lobby → setup → active → game over", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    // 1. Game created → lobby
    act(() => {
      ws.simulateMessage({
        type: "game_created",
        game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
        player: makePlayer({ id: "p1", name: "Alice" }),
      });
    });

    expect(screen.getByText("Game Lobby")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();

    // 2. Another player joins
    act(() => {
      ws.simulateMessage({
        type: "player_joined",
        player: makePlayer({ id: "p2", name: "Bob" }),
      });
    });
    expect(screen.getByText("Bob")).toBeInTheDocument();

    // 3. Game starts → setup phase
    const setupGame = makeGame({ id: "g1", status: "setup", captainId: "p1" });
    const players = [
      makePlayer({ id: "p1", name: "Alice" }),
      makePlayer({ id: "p2", name: "Bob" }),
    ];
    const wires = [
      makeWire({ id: "w1", playerId: "p1", rackPosition: 1 }),
      makeWire({ id: "w2", playerId: "p2", rackPosition: 1, value: "3" }),
    ];

    act(() => {
      ws.simulateMessage({
        type: "game_started",
        game: setupGame,
        players,
        wires,
      });
    });

    expect(screen.getByText("Place Your Opening Info Token")).toBeInTheDocument();

    // 4. Last player's placement lands → server re-broadcasts game_state with
    // status flipped to active (place_info_token's real transition path —
    // there's no separate "setup complete" message since #131).
    const activeGame = makeGame({
      id: "g1",
      status: "active",
      captainId: "p1",
      currentTurnPlayerId: "p1",
      detonatorPosition: 0,
      detonatorMax: 4,
    });

    act(() => {
      ws.simulateMessage({
        type: "game_state",
        game: activeGame,
        players,
        wires,
        infoTokens: [],
        validationTokens: [],
        localPlayerId: "p1",
      });
    });

    expect(screen.getByText("Your turn — choose an action")).toBeInTheDocument();

    // 5. Game over → overlay
    act(() => {
      ws.simulateMessage({
        type: "game_over",
        result: "won",
        reason: "All values validated!",
      });
    });

    expect(screen.getByText("Mission Complete!")).toBeInTheDocument();
    expect(screen.getByText("All values validated!")).toBeInTheDocument();
  });

  it("shows error banner when server sends error", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    act(() => {
      ws.simulateMessage({
        type: "game_created",
        game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
        player: makePlayer({ id: "p1", name: "Alice" }),
      });
    });

    act(() => {
      ws.simulateMessage({ type: "error", message: "Game is full" });
    });

    expect(screen.getByText("Game is full")).toBeInTheDocument();
  });

  describe("[DEV] Skip Turn button", () => {
    function renderActiveGame() {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();
      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_started",
          game: makeGame({ id: "g1", status: "setup", captainId: "p1" }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_state",
          game: makeGame({
            id: "g1",
            status: "active",
            captainId: "p1",
            currentTurnPlayerId: "p1",
            detonatorPosition: 0,
            detonatorMax: 4,
          }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
          infoTokens: [],
          validationTokens: [],
          localPlayerId: "p1",
        });
      });
    }

    it("does not render Skip Turn button when NEXT_PUBLIC_ENABLE_DEV_TOOLS is unset", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
      renderActiveGame();
      expect(screen.queryByText("[DEV] Skip Turn")).not.toBeInTheDocument();
    });

    it("renders Skip Turn button when NEXT_PUBLIC_ENABLE_DEV_TOOLS=true", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      renderActiveGame();
      expect(screen.getByText("[DEV] Skip Turn")).toBeInTheDocument();
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("calls POST /dev/advance-turn with joinCode on click", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3001";
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      renderActiveGame();

      const btn = screen.getByText("[DEV] Skip Turn");
      fireEvent.click(btn);

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/dev/advance-turn",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ joinCode: "ABC123" }),
        })
      );

      vi.unstubAllGlobals();
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });
  });

  describe("[DEV] Reveal All Tokens button", () => {
    function renderSetupGame() {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();
      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_started",
          game: makeGame({ id: "g1", status: "setup", captainId: "p1" }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
        });
      });
    }

    function renderActiveGame() {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();
      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_started",
          game: makeGame({ id: "g1", status: "setup", captainId: "p1" }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_state",
          game: makeGame({
            id: "g1",
            status: "active",
            captainId: "p1",
            currentTurnPlayerId: "p1",
            detonatorPosition: 0,
            detonatorMax: 4,
          }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
          infoTokens: [],
          validationTokens: [],
          localPlayerId: "p1",
        });
      });
    }

    it("does not render when NEXT_PUBLIC_ENABLE_DEV_TOOLS is unset", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
      renderSetupGame();
      expect(screen.queryByText("[DEV] Reveal All Tokens")).not.toBeInTheDocument();
    });

    it("renders during setup phase when NEXT_PUBLIC_ENABLE_DEV_TOOLS=true", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      renderSetupGame();
      expect(screen.getByText("[DEV] Reveal All Tokens")).toBeInTheDocument();
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("renders during active play alongside Skip Turn", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      renderActiveGame();
      expect(screen.getByText("[DEV] Reveal All Tokens")).toBeInTheDocument();
      expect(screen.getByText("[DEV] Skip Turn")).toBeInTheDocument();
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("calls POST /dev/reveal-all-tokens with joinCode on click", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3001";
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      renderSetupGame();

      const btn = screen.getByText("[DEV] Reveal All Tokens");
      fireEvent.click(btn);

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/dev/reveal-all-tokens",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ joinCode: "ABC123" }),
        })
      );

      vi.unstubAllGlobals();
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });
  });

  it("shows loss overlay on game_over lost", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    const game = makeGame({
      id: "g1",
      status: "active",
      captainId: "p1",
      currentTurnPlayerId: "p1",
      detonatorPosition: 3,
      detonatorMax: 4,
    });

    act(() => {
      ws.simulateMessage({
        type: "game_created",
        game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
        player: makePlayer({ id: "p1", name: "Alice" }),
      });
    });

    act(() => {
      ws.simulateMessage({
        type: "game_started",
        game: { ...game, status: "setup" },
        players: [makePlayer({ id: "p1", name: "Alice" })],
        wires: [makeWire({ id: "w1", playerId: "p1" })],
      });
    });

    act(() => {
      ws.simulateMessage({
        type: "game_state",
        game,
        players: [makePlayer({ id: "p1", name: "Alice" })],
        wires: [makeWire({ id: "w1", playerId: "p1" })],
        infoTokens: [],
        validationTokens: [],
        localPlayerId: "p1",
      });
    });

    act(() => {
      ws.simulateMessage({
        type: "game_over",
        result: "lost",
        reason: "Detonator exploded!",
      });
    });

    expect(screen.getByText("Mission Failed")).toBeInTheDocument();
    expect(screen.getByText("Detonator exploded!")).toBeInTheDocument();
  });

  describe("join code visibility (#138)", () => {
    it("does not duplicate the join code badge in the lobby (Lobby already shows it inline)", () => {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();
      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
        });
      });
      // Lobby renders the join code itself — exactly one occurrence expected.
      expect(screen.getAllByText("ABC123")).toHaveLength(1);
    });

    it("shows the join code badge during setup phase", () => {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();
      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_started",
          game: makeGame({ id: "g1", status: "setup", captainId: "p1" }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
        });
      });
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });

    it("shows the join code badge during active play", () => {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();
      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_started",
          game: makeGame({ id: "g1", status: "setup", captainId: "p1" }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_state",
          game: makeGame({
            id: "g1",
            status: "active",
            captainId: "p1",
            currentTurnPlayerId: "p1",
            detonatorPosition: 0,
            detonatorMax: 4,
          }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
          infoTokens: [],
          validationTokens: [],
          localPlayerId: "p1",
        });
      });
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });
  });

  describe("prominent error display (#error-visibility)", () => {
    it("shows an alert-role error toast during setup phase (previously had no error surface at all)", () => {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();
      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_started",
          game: makeGame({ id: "g1", status: "setup", captainId: "p1" }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
        });
      });
      act(() => {
        ws.simulateMessage({ type: "error", message: "Not your turn" });
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Not your turn");
    });

    it("shows an alert-role error toast during active play", () => {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();
      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_started",
          game: makeGame({ id: "g1", status: "setup", captainId: "p1" }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_state",
          game: makeGame({
            id: "g1",
            status: "active",
            captainId: "p1",
            currentTurnPlayerId: "p1",
            detonatorPosition: 0,
            detonatorMax: 4,
          }),
          players: [makePlayer({ id: "p1", name: "Alice" })],
          wires: [makeWire({ id: "w1", playerId: "p1" })],
          infoTokens: [],
          validationTokens: [],
          localPlayerId: "p1",
        });
      });
      act(() => {
        ws.simulateMessage({ type: "error", message: "Invalid action" });
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid action");
    });
  });

  describe("dev seat switcher", () => {
    const seatOptions = [
      { name: "Dev", profileId: "p1" },
      { name: "Alice", profileId: "p2" },
    ];

    it("does not render when seatOptions is empty", () => {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Dev" seatOptions={[]} />);
      act(() => vi.advanceTimersByTime(0));
      expect(screen.queryByText("[DEV] Seat:")).not.toBeInTheDocument();
    });

    it("renders a button per seat when seatOptions is provided", () => {
      render(
        <GameClient joinCode="ABC123" profileId="p1" playerName="Dev" seatOptions={seatOptions} />
      );
      act(() => vi.advanceTimersByTime(0));
      expect(screen.getByRole("button", { name: "Dev" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Alice" })).toBeInTheDocument();
    });

    it("switching seats closes the old WS connection and opens a new one with the new identity", () => {
      render(
        <GameClient joinCode="ABC123" profileId="p1" playerName="Dev" seatOptions={seatOptions} />
      );
      act(() => vi.advanceTimersByTime(0));
      const firstWs = getWs();
      expect(firstWs.url).toContain("profileId=p1");
      expect(firstWs.url).toContain("name=Dev");
      expect(MockWebSocket.instances).toHaveLength(1);

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Alice" }));
      });
      act(() => vi.advanceTimersByTime(0));

      expect(firstWs.close).toHaveBeenCalled();
      expect(MockWebSocket.instances).toHaveLength(2);
      const secondWs = getWs();
      expect(secondWs.url).toContain("profileId=p2");
      expect(secondWs.url).toContain("name=Alice");
    });

    it("clicking the already-active seat does not reconnect", () => {
      render(
        <GameClient joinCode="ABC123" profileId="p1" playerName="Dev" seatOptions={seatOptions} />
      );
      act(() => vi.advanceTimersByTime(0));
      expect(MockWebSocket.instances).toHaveLength(1);

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Dev" }));
      });
      act(() => vi.advanceTimersByTime(0));

      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });
});
