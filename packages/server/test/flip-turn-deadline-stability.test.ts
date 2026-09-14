import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebSocket } from "ws";
import { buildFlipGameState, type FlipGameState } from "@tabletop/game-flip";
import { makeGame, makePlayer, resetIds } from "./fixtures.js";

// #394 review (weasel/QA) — the stall vector this file proves closed: EVERY
// Flip broadcast (including a reconnect) used to call scheduleFlipTurnTimeout
// with a FRESH `Date.now() + durationMs`, and any seated player can trigger
// a broadcast for free and repeatedly by cycling their own WebSocket
// connection — reconnecting is not rate-limited the way POST /profiles is.
// That let any participant indefinitely neutralise Contract C4's "the
// platform guarantees the timeout" by reconnecting just before it expired,
// forever. The mirror image of the silent-forfeit problem C4 exists to
// prevent: worse than no timeout, because it creates a false belief the
// table can't stall.
//
// Real flip-turn-timer.js runs in this file (not mocked) so the actual
// deadline-stability guarantee is exercised, not just asserted piecewise —
// same reasoning as flip-turn-timeout-integration.test.ts.

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
  getLobbyConfig: vi.fn(() => null),
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

function lastSentTurnDeadline(): number | null {
  const calls = mockConnManager.sendToPlayer.mock.calls;
  const [, , message] = calls[calls.length - 1];
  return (message as { flip: { turnDeadline: number | null } }).flip.turnDeadline;
}

describe("Flip turn deadline stability — reconnect-cycling stall vector (#394 review)", () => {
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
    clearTurnDeadline("g1");
    vi.useRealTimers();
  });

  it("repeated re-broadcasts of the same live turn never advance the deadline", async () => {
    const state = buildFlipGameState({ players: twoSeats, turnPlayerId: "p0" });
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(state);

    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    const original = lastSentTurnDeadline();
    expect(original).not.toBeNull();

    // Five more broadcasts of the SAME live turn — exactly what five
    // reconnects (or five joins, or any other unrelated broadcast trigger)
    // for this game would produce, spread across most of the timeout
    // window, well past where a naive "now + duration" reset would have
    // pushed the deadline far into the future each time.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
      expect(lastSentTurnDeadline()).toBe(original);
    }
  });

  it("the timeout still fires at the ORIGINAL scheduled time despite repeated re-broadcasts", async () => {
    const state = buildFlipGameState({ players: twoSeats, turnPlayerId: "p0" });
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(state);

    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));

    // Re-broadcast (simulating a reconnect) every 5s for 40 of the 45s
    // window — if the deadline were advancing, the timeout would never
    // fire at all as long as reconnects kept coming.
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    }
    expect(mockFlipGamesDb.saveFlipGameState).not.toHaveBeenCalled();

    // The remaining ~5s to the ORIGINAL 45s deadline — it must fire here,
    // not be indefinitely postponed by the reconnects above.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockFlipGamesDb.saveFlipGameState).toHaveBeenCalledTimes(1);
  });

  it("a genuine reconnect BY THE TURN PLAYER keeps their own clock running toward the same original deadline — never resets or cancels it", async () => {
    const state = buildFlipGameState({ players: twoSeats, turnPlayerId: "p0" });
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(state);

    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    const original = lastSentTurnDeadline();

    // The app.ts reconnect branch calls broadcastGameState unconditionally
    // on ANY successful reconnect, including the turn player's own — this
    // is that exact call, arriving partway through the window.
    await vi.advanceTimersByTimeAsync(20_000);
    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    expect(lastSentTurnDeadline()).toBe(original); // unmoved by their own reconnect

    // #448's C4 argument: the clock must keep running through the
    // reconnect, not pause or cancel — confirmed by the auto-action still
    // firing at the original time even though the turn player reconnected
    // partway through.
    await vi.advanceTimersByTimeAsync(24_999);
    expect(mockFlipGamesDb.saveFlipGameState).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFlipGamesDb.saveFlipGameState).toHaveBeenCalledTimes(1);
  });

  it("a nested Flip 3 target choice gets its OWN fresh deadline, not the outer one's leftover time (#394 review round 2)", async () => {
    // QA's finding: chooseFlip3Target's own advance() can hit a SECOND
    // flip3-drawn card while dealing through the just-pushed level, setting
    // pendingAction back to {kind:'flip3'} for the SAME turnPlayerId,
    // synchronously, with no intervening broadcast between the outer choice
    // resolving and the nested one appearing. turnPlayerId and
    // pendingAction.kind alone are byte-identical for both — this
    // reproduces exactly that pair of states, distinguished only by the
    // trailing resolutionLog entry (a different card, per drawCardTo's
    // uniquely-id'd draws) the way the real engine would leave them.
    const outerFlip3Card = { id: "shoe:11", kind: "action" as const, action: "flip3" as const };
    const nestedFlip3Card = { id: "shoe:12", kind: "action" as const, action: "flip3" as const };

    const outer = buildFlipGameState({
      players: twoSeats,
      turnPlayerId: "p0",
      pendingAction: { kind: "flip3" },
    });
    const outerState: FlipGameState = {
      ...outer,
      resolutionLog: [{ targetId: "p1", card: outerFlip3Card, effect: "flip3-drawn", context: "flip3" }],
    };
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(outerState);
    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    const outerDeadline = lastSentTurnDeadline();

    // 40 of the outer choice's 45s window elapse before the target actually
    // resolves — same as QA's scratch reproduction.
    await vi.advanceTimersByTimeAsync(40_000);

    // The nested draw: same turnPlayerId, same pendingAction.kind, but the
    // trailing resolutionLog entry is now a DIFFERENT card — what
    // chooseFlip3Target's advance() actually leaves behind when the level it
    // just pushed itself draws a flip3 card before its own target is chosen.
    const nestedState: FlipGameState = {
      ...outerState,
      resolutionLog: [
        ...outerState.resolutionLog,
        { targetId: "p1", card: nestedFlip3Card, effect: "flip3-drawn", context: "flip3" },
      ],
    };
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(nestedState);
    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    const nestedDeadline = lastSentTurnDeadline();

    // The whole point: the nested prompt is a genuinely new decision nobody
    // has seen before, so it must get its own full window — not inherit the
    // ~5s left on the outer one.
    expect(nestedDeadline).not.toBe(outerDeadline);
    expect(nestedDeadline!).toBeGreaterThan(outerDeadline!);

    // And the stability guarantee still holds for repeats of the NESTED
    // choice itself — a reconnect during the nested prompt must not extend
    // it either.
    await vi.advanceTimersByTimeAsync(5_000);
    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    expect(lastSentTurnDeadline()).toBe(nestedDeadline);
  });

  it("a genuinely NEW turn (different turnPlayerId) correctly gets a fresh deadline, not the previous turn's", async () => {
    const firstTurn = buildFlipGameState({ players: twoSeats, turnPlayerId: "p0" });
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(firstTurn);
    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    const firstDeadline = lastSentTurnDeadline();

    await vi.advanceTimersByTimeAsync(10_000);

    const secondTurn: FlipGameState = { ...firstTurn, turnPlayerId: "p1" };
    mockFlipGamesDb.getFlipGameState.mockResolvedValue(secondTurn);
    await broadcastGameState("g1", makeGame({ id: "g1", gameType: "flip" }));
    const secondDeadline = lastSentTurnDeadline();

    // A real new turn is NOT held back by the stability fix — only
    // re-broadcasts of the SAME turn are.
    expect(secondDeadline).not.toBe(firstDeadline);
    expect(secondDeadline!).toBeGreaterThan(firstDeadline!);
  });
});
