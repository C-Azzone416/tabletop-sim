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

  describe("dev panel: Skip Turn", () => {
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

    it("does not render the dev panel toggle when NEXT_PUBLIC_ENABLE_DEV_TOOLS is unset", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
      renderActiveGame();
      expect(screen.queryByRole("button", { name: "Open dev tools" })).not.toBeInTheDocument();
    });

    it("renders Skip Turn inside the dev panel when NEXT_PUBLIC_ENABLE_DEV_TOOLS=true", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      renderActiveGame();
      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));
      expect(screen.getByText("Skip Turn")).toBeInTheDocument();
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("calls POST /dev/advance-turn with joinCode on click", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3001";
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      renderActiveGame();
      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));

      const btn = screen.getByText("Skip Turn");
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

  describe("dev panel: Reveal All Tokens", () => {
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

    it("does not render the dev panel toggle when NEXT_PUBLIC_ENABLE_DEV_TOOLS is unset", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
      renderSetupGame();
      expect(screen.queryByRole("button", { name: "Open dev tools" })).not.toBeInTheDocument();
    });

    it("renders during setup phase when NEXT_PUBLIC_ENABLE_DEV_TOOLS=true", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      renderSetupGame();
      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));
      expect(screen.getByText("Reveal All Tokens")).toBeInTheDocument();
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("renders during active play alongside Skip Turn", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      renderActiveGame();
      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));
      expect(screen.getByText("Reveal All Tokens")).toBeInTheDocument();
      expect(screen.getByText("Skip Turn")).toBeInTheDocument();
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("calls POST /dev/reveal-all-tokens with joinCode on click", () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
      process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3001";
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      renderSetupGame();
      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));

      const btn = screen.getByText("Reveal All Tokens");
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

  describe("continue playing after win/loss (#157)", () => {
    it("captain sees mission controls and sending next_mission over WS", () => {
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();

      const game = makeGame({ id: "g1", status: "active", captainId: "p1", mission: 2 });

      act(() => {
        ws.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Alice" }),
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
        ws.simulateMessage({ type: "game_over", result: "won", reason: "All wires cut!" });
      });

      const nextMissionButton = screen.getByRole("button", { name: "Next Mission (3)" });
      fireEvent.click(nextMissionButton);

      const sentMessages = ws.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw));
      expect(sentMessages).toContainEqual({ type: "next_mission", mission: 3 });
    });

    it("non-captain sees a waiting message, not mission controls", () => {
      render(<GameClient joinCode="ABC123" profileId="p2" playerName="Bob" />);
      act(() => vi.advanceTimersByTime(0));
      const ws = getWs();

      const game = makeGame({ id: "g1", status: "active", captainId: "p1", mission: 1 });

      act(() => {
        ws.simulateMessage({
          type: "joined_game",
          game: { ...game, status: "waiting" },
          player: makePlayer({ id: "p2", name: "Bob" }),
          players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })],
        });
      });
      act(() => {
        ws.simulateMessage({
          type: "game_state",
          game,
          players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })],
          wires: [makeWire({ id: "w1", playerId: "p1" }), makeWire({ id: "w2", playerId: "p2" })],
          infoTokens: [],
          validationTokens: [],
          localPlayerId: "p2",
        });
      });
      act(() => {
        ws.simulateMessage({ type: "game_over", result: "won", reason: "All wires cut!" });
      });

      expect(
        screen.getByText("Waiting for the captain to choose the next mission..."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Next Mission/ })).not.toBeInTheDocument();
    });
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

  describe("dev panel seat switching (#144)", () => {
    const seatOptions = [
      { name: "Dev", profileId: "p1" },
      { name: "Alice", profileId: "p2" },
    ];

    beforeEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
    });

    afterEach(() => {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("does not render the dev panel toggle when seatOptions is empty and dev tools are off", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
      render(<GameClient joinCode="ABC123" profileId="p1" playerName="Dev" seatOptions={[]} />);
      act(() => vi.advanceTimersByTime(0));
      expect(screen.queryByRole("button", { name: "Open dev tools" })).not.toBeInTheDocument();
    });

    it("renders a button per seat once the collapsed panel is opened", () => {
      render(
        <GameClient joinCode="ABC123" profileId="p1" playerName="Dev" seatOptions={seatOptions} />
      );
      act(() => vi.advanceTimersByTime(0));
      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));
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

      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));
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

      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Dev" }));
      });
      act(() => vi.advanceTimersByTime(0));

      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe("auto-switch to turn holder on setup→active transition (#149)", () => {
    const seatOptions = [
      { name: "Dev", profileId: "p1" },
      { name: "Carol", profileId: "p4" },
    ];

    beforeEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS = "true";
    });

    afterEach(() => {
      delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
    });

    it("follows the turn holder when the last opening-token placement lands on a different seat", () => {
      render(
        <GameClient joinCode="ABC123" profileId="p1" playerName="Dev" seatOptions={seatOptions} />
      );
      act(() => vi.advanceTimersByTime(0));
      const devWs = getWs();

      act(() => {
        devWs.simulateMessage({
          type: "game_created",
          game: makeGame({ id: "g1", status: "waiting", captainId: "p1" }),
          player: makePlayer({ id: "p1", name: "Dev" }),
        });
      });
      act(() => {
        devWs.simulateMessage({
          type: "game_started",
          game: makeGame({ id: "g1", status: "setup", captainId: "p1", currentTurnPlayerId: "p4" }),
          players: [makePlayer({ id: "p1", name: "Dev" }), makePlayer({ id: "p4", name: "Carol" })],
          wires: [makeWire({ id: "w1", playerId: "p4" })],
        });
      });

      // Tester switches to Carol to place the last opening token as her.
      fireEvent.click(screen.getByRole("button", { name: "Open dev tools" }));
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Carol" }));
      });
      act(() => vi.advanceTimersByTime(0));
      expect(MockWebSocket.instances).toHaveLength(2);

      // Carol's placement was last — game goes active on the CAPTAIN's turn
      // (Dev), not Carol's. Broadcast arrives on Carol's still-open socket.
      const carolWs = getWs();
      act(() => {
        carolWs.simulateMessage({
          type: "game_state",
          game: makeGame({
            id: "g1",
            status: "active",
            captainId: "p1",
            currentTurnPlayerId: "p1",
            detonatorPosition: 0,
            detonatorMax: 3,
          }),
          players: [makePlayer({ id: "p1", name: "Dev" }), makePlayer({ id: "p4", name: "Carol" })],
          wires: [makeWire({ id: "w1", playerId: "p4" })],
          infoTokens: [],
          validationTokens: [],
          localPlayerId: "p4",
        });
      });
      act(() => vi.advanceTimersByTime(0));

      // Auto-followed the turn holder: a third WS connection opens as Dev.
      expect(MockWebSocket.instances).toHaveLength(3);
      const finalWs = getWs();
      expect(finalWs.url).toContain("profileId=p1");
      expect(finalWs.url).toContain("name=Dev");
    });

    it("shows which seat is currently being viewed on the collapsed toggle", () => {
      render(
        <GameClient joinCode="ABC123" profileId="p1" playerName="Dev" seatOptions={seatOptions} />
      );
      act(() => vi.advanceTimersByTime(0));
      const toggle = screen.getByRole("button", { name: "Open dev tools" });
      expect(toggle.textContent).toContain("Viewing: Dev");

      fireEvent.click(toggle);
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Carol" }));
      });
      act(() => vi.advanceTimersByTime(0));
      fireEvent.click(screen.getByRole("button", { name: "Close dev tools" }));

      const toggleAfter = screen.getByRole("button", { name: "Open dev tools" });
      expect(toggleAfter.textContent).toContain("Viewing: Carol");
    });
  });
});
