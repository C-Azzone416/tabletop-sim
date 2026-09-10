import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

import { GameClient } from "../app/game/[joinCode]/GameClient";
import { makeGame, makePlayer, resetIds } from "./fixtures";
import type { ServerMessage } from "@tabletop/shared";
import type { FlipTableView } from "@tabletop/shared";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../app/hooks/useMissionOutcomes", () => ({
  useMissionOutcomes: () => ({}),
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

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function getWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

function flipView(overrides: Partial<FlipTableView> = {}): FlipTableView {
  return {
    phase: "round-in-progress",
    roundNumber: 1,
    dealerId: "p1",
    turnPlayerId: "p1",
    players: [
      { id: "p1", name: "Alice", status: "active", hand: [], totalScore: 0, uniqueNumberCount: 0, rounds: [] },
      { id: "p2", name: "Bob", status: "active", hand: [], totalScore: 0, uniqueNumberCount: 0, rounds: [] },
    ],
    shoeRemaining: 90,
    discardCount: 0,
    pendingAction: null,
    flip3Stack: [],
    lastRoundResult: null,
    winnerId: null,
    resolutionLog: [],
    ...overrides,
  };
}

function flipGameStateMessage(overrides: {
  gameOverrides?: Parameters<typeof makeGame>[0];
  flip?: Partial<FlipTableView>;
  localPlayerId?: string;
} = {}): ServerMessage {
  const players = [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })];
  return {
    type: "game_state",
    game: makeGame({ id: "g1", gameType: "flip", status: "active", ...overrides.gameOverrides }),
    players,
    localPlayerId: overrides.localPlayerId ?? "p1",
    flip: flipView(overrides.flip),
    // Flip's broadcast omits these — undefined at runtime, matching #382.
  } as unknown as ServerMessage;
}

describe("GameClient — Flip rendering (#383)", () => {
  beforeEach(() => {
    resetIds();
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS;
  });

  it("renders the Flip table, not the Wire Game board, for an active flip game", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    act(() => {
      ws.simulateMessage(flipGameStateMessage());
    });

    expect(screen.getByTestId("play-surface")).toBeInTheDocument();
    expect(screen.getByTestId("seat-rail")).toBeInTheDocument();
    // Wire-only affordance must never appear on this path.
    expect(screen.queryByText("Your turn — choose an action")).not.toBeInTheDocument();
    expect(screen.queryByText("Game Lobby")).not.toBeInTheDocument();
  });

  it("sends flip_hit when the local (active) player clicks Hit", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    act(() => {
      ws.simulateMessage(flipGameStateMessage());
    });

    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "flip_hit" }));
  });

  it("shows a Start Round button to the dealer during awaiting-round-start, and sends flip_start_round on click", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    act(() => {
      ws.simulateMessage(
        flipGameStateMessage({ flip: { phase: "awaiting-round-start", turnPlayerId: null } }),
      );
    });

    const button = screen.getByRole("button", { name: "Start Round" });
    fireEvent.click(button);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "flip_start_round" }));
  });

  it("does not show a Start Round button to a non-dealer during awaiting-round-start", () => {
    render(<GameClient joinCode="ABC123" profileId="p2" playerName="Bob" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    act(() => {
      ws.simulateMessage(
        flipGameStateMessage({
          flip: { phase: "awaiting-round-start", turnPlayerId: null },
          localPlayerId: "p2",
        }),
      );
    });

    expect(screen.queryByRole("button", { name: "Start Round" })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting on the dealer/)).toBeInTheDocument();
  });

  it("shows the winner on game-over", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    act(() => {
      ws.simulateMessage(
        flipGameStateMessage({
          flip: {
            phase: "game-over",
            winnerId: "p1",
            players: [
              { id: "p1", name: "Alice", status: "active", hand: [], totalScore: 210, uniqueNumberCount: 0, rounds: [] },
              { id: "p2", name: "Bob", status: "active", hand: [], totalScore: 150, uniqueNumberCount: 0, rounds: [] },
            ],
          },
        }),
      );
    });

    expect(screen.getByText("Alice wins!")).toBeInTheDocument();
  });

  // Regression: FlipGameRoot built the picker's onChooseFreezeTarget/
  // onChooseFlip3Target props but never passed them through to FlipTable,
  // so a target-choice click (and, once it exists, C4's timeout self-target
  // through the same callbacks) had nothing to call.
  it("sends flip_choose_freeze_target with targetPlayerId when the flipper picks a target", () => {
    render(<GameClient joinCode="ABC123" profileId="p1" playerName="Alice" />);
    act(() => vi.advanceTimersByTime(0));
    const ws = getWs();

    act(() => {
      ws.simulateMessage(
        flipGameStateMessage({ flip: { pendingAction: { kind: "freeze", flipperId: "p1", eligibleTargetIds: ["p1", "p2"] } } }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "flip_choose_freeze_target", targetPlayerId: "p2" }),
    );
  });
});
