import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebSocket } from "ws";
import { buildFlipGameState, type FlipGameState } from "@tabletop/game-flip";
import { makeGame, makePlayer, resetIds } from "./fixtures.js";

// #394 (Contract C4) — this file is deliberately separate from
// state-broadcaster.test.ts: that file mocks flip-turn-timer.js entirely
// (correctly, for asserting on broadcast message SHAPE without arming real
// timers). This file does the opposite on purpose — flip-turn-timer.js and
// flip-actions.js run FOR REAL, with fake timers standing in for wall clock
// time, so the actual guarantee (the server fires the ruled default action
// with nobody clicking anything) is exercised end to end rather than
// asserted piecewise.

vi.mock("../src/db/wires.js", () => ({ getWiresByGameId: vi.fn() }));
vi.mock("../src/db/tokens.js", () => ({
  getInfoTokensByGameId: vi.fn(),
  getValidationTokensByGameId: vi.fn(),
}));
vi.mock("../src/db/candidates.js", () => ({ getWireCandidatesByGameId: vi.fn() }));
vi.mock("../src/db/flip-games.js", () => ({
  getFlipGameState: vi.fn(),
  saveFlipGameState: vi.fn(),
  recordFlipRoundScores: vi.fn(),
  getFlipRoundScores: vi.fn(),
}));
vi.mock("../src/ws/connection-manager.js", () => ({
  getGameSockets: vi.fn(() => new Map()),
  sendToPlayer: vi.fn(),
}));
vi.mock("../src/db/players.js", () => ({ getPlayersByGameId: vi.fn() }));
vi.mock("../src/db/games.js", () => ({
  getGameCreatedVia: vi.fn(),
  getGameById: vi.fn(),
}));

import * as flipGamesDb from "../src/db/flip-games.js";
import * as connManager from "../src/ws/connection-manager.js";
import * as playersDb from "../src/db/players.js";
import * as gamesDb from "../src/db/games.js";
import { broadcastGameState } from "../src/ws/state-broadcaster.js";
import { cancelFlipTurnTimeout, clearTurnDeadline } from "../src/ws/flip-turn-timer.js";

const mockFlipGamesDb = vi.mocked(flipGamesDb);
const mockConnManager = vi.mocked(connManager);
const mockPlayersDb = vi.mocked(playersDb);
const mockGamesDb = vi.mocked(gamesDb);

const twoSeats = [
  { id: "p0", name: "Dev" },
  { id: "p1", name: "Alice" },
];

describe("Flip turn timeout — end-to-end firing (#394)", () => {
  beforeEach(() => {
    resetIds();
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockConnManager.getGameSockets.mockReturnValue(
      new Map([["p0", {}], ["p1", {}]]) as Map<string, WebSocket>,
    );
    mockPlayersDb.getPlayersByGameId.mockResolvedValue([
      makePlayer({ id: "p0" }),
      makePlayer({ id: "p1" }),
    ]);
    mockFlipGamesDb.getFlipRoundScores.mockResolvedValue([]);
    mockGamesDb.getGameCreatedVia.mockResolvedValue("lobby");
    mockGamesDb.getGameById.mockResolvedValue(makeGame({ id: "g1", gameType: "flip" }));
  });

  afterEach(() => {
    cancelFlipTurnTimeout("g1");
    // #394 review — turnDeadlineFor's armed-deadline map is module-level
    // and outlives a single test: without clearing it, a later test that
    // happens to reconstruct the SAME signature ("p0:none", say) for "g1"
    // would silently reuse a PRIOR test's stale deadline instead of
    // computing fresh, since turnDeadlineFor's whole point is treating a
    // matching signature as "the same turn, don't advance." That's
    // correct in production; it's just not what a fresh test means by "a
    // new turn that happens to look the same."
    clearTurnDeadline("g1");
    vi.useRealTimers();
  });

  it("auto-Freezes a Hit/Freeze decision nobody made in time, and re-broadcasts", async () => {
    const state = buildFlipGameState({ players: twoSeats, turnPlayerId: "p0" });
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(state);

    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    expect(mockConnManager.sendToPlayer).toHaveBeenCalledTimes(2); // the initial broadcast

    // After the auto-action fires, the NEXT read of state must reflect it —
    // simulate the persisted state after a freeze the same way applyFlipAction
    // would leave it: no longer this player's live decision.
    const afterFreeze: FlipGameState = { ...state, turnPlayerId: null, phase: "round-over" };
    mockFlipGamesDb.saveFlipGameState.mockImplementation(async () => {
      mockFlipGamesDb.getFlipGameState.mockResolvedValue(afterFreeze);
    });

    await vi.advanceTimersByTimeAsync(45_000);

    expect(mockFlipGamesDb.saveFlipGameState).toHaveBeenCalledTimes(1);
    const [, savedState] = mockFlipGamesDb.saveFlipGameState.mock.calls[0];
    // freeze() locks the hand and clears turnPlayerId (round ends for a
    // 2-seat table once the last active player freezes) — the concrete,
    // checkable proof that the REAL freeze() ran, not a stand-in.
    expect((savedState as FlipGameState).turnPlayerId).not.toBe("p0");

    // Re-broadcast after the auto-action: total sends grew past the initial 2.
    expect(mockConnManager.sendToPlayer.mock.calls.length).toBeGreaterThan(2);
  });

  it("self-targets a pending Freeze card nobody chose in time — never another seat", async () => {
    const state = buildFlipGameState({
      players: twoSeats,
      turnPlayerId: "p0",
      pendingAction: { kind: "freeze" },
    });
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(state);

    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));

    await vi.advanceTimersByTimeAsync(45_000);

    expect(mockFlipGamesDb.saveFlipGameState).toHaveBeenCalledTimes(1);
    const [, savedState] = mockFlipGamesDb.saveFlipGameState.mock.calls[0];
    // chooseFreezeTarget marks its TARGET player 'frozen' — this is the
    // concrete, checkable proof of WHO got targeted, not just that
    // something resolved. p0 (the flipper) must be frozen; p1 must not be,
    // which is what an opponent-targeting bug would produce instead.
    const players = (savedState as FlipGameState).players;
    expect(players.find((p) => p.id === "p0")?.status).toBe("frozen");
    expect(players.find((p) => p.id === "p1")?.status).not.toBe("frozen");
    expect((savedState as FlipGameState).pendingAction).toBeNull();
  });

  it("does not fire early, and does not fire twice for one expiry", async () => {
    const state = buildFlipGameState({ players: twoSeats, turnPlayerId: "p0" });
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(state);

    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));

    await vi.advanceTimersByTimeAsync(44_999);
    expect(mockFlipGamesDb.saveFlipGameState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mockFlipGamesDb.saveFlipGameState).toHaveBeenCalledTimes(1);

    // Nothing left armed to double-fire.
    await vi.advanceTimersByTimeAsync(100_000);
    expect(mockFlipGamesDb.saveFlipGameState).toHaveBeenCalledTimes(1);
  });

  it("a real action landing before the deadline cancels the auto-action — no double-apply", async () => {
    const state = buildFlipGameState({ players: twoSeats, turnPlayerId: "p0" });
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(state);

    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));

    // The player acts for real with 1s to spare — the equivalent of a fresh
    // broadcast for a resolved round (what a real hit/freeze handler does:
    // save, then broadcast again, which re-arms/cancels for the new state).
    const resolved: FlipGameState = { ...state, turnPlayerId: null, phase: "round-over" };
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(resolved);
    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));

    await vi.advanceTimersByTimeAsync(45_000);

    // The FIRST timer (armed for the original decision) must not have fired
    // and auto-frozen a decision the player already made themselves.
    expect(mockFlipGamesDb.saveFlipGameState).not.toHaveBeenCalled();
  });
});
