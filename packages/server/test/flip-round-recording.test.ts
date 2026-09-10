import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFlipDeck, buildFlipGameState, flipCards, type FlipGameState } from "@tabletop/game-flip";

vi.mock("../src/db/flip-games.js", () => ({
  getFlipGameState: vi.fn(),
  saveFlipGameState: vi.fn(),
  recordFlipRoundScores: vi.fn(),
  getFlipRoundScores: vi.fn(),
}));

import * as flipGamesDb from "../src/db/flip-games.js";
import { executeFlipAction } from "../src/ws/flip-actions.js";

const mockDb = vi.mocked(flipGamesDb);

// #396 — the gap this closes: recordFlipRoundScores existed and was tested,
// but nothing in the live flow called it, so flip_round_scores stayed empty
// and the scoreboard had no history. These drive real actions through
// executeFlipAction and assert the write happens exactly when a round scores.

const seats = [
  { id: "p0", name: "Dev" },
  { id: "p1", name: "Alice" },
];

/** A hand plus an explicit deterministic shoe, so no draw is left to chance. */
const stacked = (topSpecs: string[], hands: Record<string, string[]>, over = {}): FlipGameState => {
  const built: Record<string, ReturnType<typeof flipCards>> = {};
  for (const [id, specs] of Object.entries(hands)) built[id] = flipCards(specs);
  const top = flipCards(topSpecs);
  const rest = buildFlipDeck("rest");
  const key = (c: { id: string }) => JSON.stringify({ ...c, id: 0 });
  for (const card of [...Object.values(built).flat(), ...top]) {
    const i = rest.findIndex((c) => key(c) === key(card));
    rest.splice(i, 1);
  }
  return buildFlipGameState({
    players: seats,
    hands: built,
    shoe: [...top, ...rest],
    turnPlayerId: "p1",
    ...over,
  });
};

describe("recording a round when it scores (#396)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.recordFlipRoundScores.mockResolvedValue(undefined);
    mockDb.saveFlipGameState.mockResolvedValue(undefined);
  });

  it("writes no round row for an action that does not end the round", async () => {
    // p1 hits a 5 into a hand holding 4 — play continues.
    mockDb.getFlipGameState.mockResolvedValue(stacked(["5"], { p1: ["4"] }));

    await executeFlipAction("g1", "p1", { kind: "hit" });

    expect(mockDb.saveFlipGameState).toHaveBeenCalledTimes(1);
    expect(mockDb.recordFlipRoundScores).not.toHaveBeenCalled();
  });

  it("writes one row per player when the round ends", async () => {
    // p0 already frozen; p1 freezing ends the round.
    mockDb.getFlipGameState.mockResolvedValue(
      stacked([], { p1: ["4"] }, { statuses: { p0: "frozen" } }),
    );

    await executeFlipAction("g1", "p1", { kind: "freeze" });

    expect(mockDb.recordFlipRoundScores).toHaveBeenCalledTimes(1);
    const [gameId, roundNumber, rows] = mockDb.recordFlipRoundScores.mock.calls[0];
    expect(gameId).toBe("g1");
    expect(roundNumber).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.playerId).sort()).toEqual(["p0", "p1"]);
  });

  // The #365 acceptance criterion, at the point the data is created.
  it("records a breakdown alongside the score", async () => {
    mockDb.getFlipGameState.mockResolvedValue(
      stacked([], { p1: ["7", "+4", "x2"] }, { statuses: { p0: "frozen" } }),
    );

    await executeFlipAction("g1", "p1", { kind: "freeze" });

    const [, , rows] = mockDb.recordFlipRoundScores.mock.calls[0];
    const p1 = rows.find((r) => r.playerId === "p1")!;
    // (7 + 4) x2 = 22
    expect(p1.score).toBe(22);
    expect(p1.breakdown).toMatchObject({ numbersSum: 7, plusSum: 4, hasX2: true, flip7Bonus: 0, total: 22 });
  });

  it("records a Flip 7's +15 as its own term, not folded into the total", async () => {
    // Six unique numbers held, the seventh on top: the hit ends the round.
    mockDb.getFlipGameState.mockResolvedValue(
      stacked(["7"], { p1: ["1", "2", "3", "4", "5", "6"] }),
    );

    await executeFlipAction("g1", "p1", { kind: "hit" });

    expect(mockDb.recordFlipRoundScores).toHaveBeenCalledTimes(1);
    const [, , rows] = mockDb.recordFlipRoundScores.mock.calls[0];
    const p1 = rows.find((r) => r.playerId === "p1")!;
    expect(p1.flip7).toBe(true);
    expect(p1.breakdown).toMatchObject({ numbersSum: 28, flip7Bonus: 15, total: 43 });
    expect(p1.score).toBe(43);
  });

  it("records a busted hand as 0 with every breakdown field zeroed", async () => {
    // p1 draws a duplicate 4 and busts; p0 frozen, so the round ends.
    mockDb.getFlipGameState.mockResolvedValue(
      stacked(["4"], { p1: ["4", "+10"] }, { statuses: { p0: "frozen" } }),
    );

    await executeFlipAction("g1", "p1", { kind: "hit" });

    const [, , rows] = mockDb.recordFlipRoundScores.mock.calls[0];
    const p1 = rows.find((r) => r.playerId === "p1")!;
    expect(p1.busted).toBe(true);
    expect(p1.score).toBe(0);
    // Held +10 must not appear as points it did not score (#358).
    expect(p1.breakdown).toMatchObject({ plusSum: 0, total: 0, busted: true });
  });

  // Losing a history row must not cost a player their turn: the score is
  // already in totalScore in the state blob, which is the figure of record.
  it("does not fail the action when recording the round throws", async () => {
    mockDb.getFlipGameState.mockResolvedValue(
      stacked([], { p1: ["4"] }, { statuses: { p0: "frozen" } }),
    );
    mockDb.recordFlipRoundScores.mockRejectedValueOnce(new Error("db down"));

    await expect(executeFlipAction("g1", "p1", { kind: "freeze" })).resolves.toBeUndefined();
    expect(mockDb.saveFlipGameState).toHaveBeenCalledTimes(1);
  });

  // Guards against double-counting if the same state were replayed.
  it("does not re-record a round that was already the last result", async () => {
    const ended = buildFlipGameState({
      players: seats,
      phase: "awaiting-round-start",
      lastRoundResult: {
        roundNumber: 1,
        scores: { p0: 5, p1: 9 },
        flip7PlayerId: null,
        breakdowns: {},
      },
    });
    mockDb.getFlipGameState.mockResolvedValue(ended);

    // Any action on this state is rejected, so nothing is recorded either.
    await expect(executeFlipAction("g1", "p1", { kind: "hit" })).rejects.toThrow();
    expect(mockDb.recordFlipRoundScores).not.toHaveBeenCalled();
  });
});
