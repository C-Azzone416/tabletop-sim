import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
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
      makeWire({ id: "w1", playerId: "p1", rackPosition: 0 }),
      makeWire({ id: "w2", playerId: "p2", rackPosition: 0, value: "3" }),
    ];

    act(() => {
      ws.simulateMessage({
        type: "game_started",
        game: setupGame,
        players,
        wires,
      });
    });

    expect(screen.getByText("Setup Phase")).toBeInTheDocument();

    // 4. Setup complete → active game
    const activeGame = makeGame({
      id: "g1",
      status: "active",
      captainId: "p1",
      currentTurnPlayerId: "p1",
      detonatorPosition: 0,
      detonatorMax: 4,
    });

    act(() => {
      ws.simulateMessage({ type: "setup_complete", game: activeGame });
    });

    expect(screen.getByText("Your turn — choose an action")).toBeInTheDocument();
    expect(screen.getByText("Detonator")).toBeInTheDocument();

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
      ws.simulateMessage({ type: "setup_complete", game });
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
});
