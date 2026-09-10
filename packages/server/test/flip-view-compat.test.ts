import { describe, it, expect } from "vitest";
import { buildFlipGameState, flipCards, type FlipCardInstance, type FlipGameState } from "@tabletop/game-flip";
import type { FlipCardView, FlipTableView } from "@tabletop/shared";
import { toFlipTableView } from "../src/ws/flip-view.js";

// #382 — the transport DTO in @tabletop/shared deliberately mirrors the
// engine's types rather than importing them: game-flip depends on shared, and
// the client depends only on shared, so importing the other way would be a
// cycle. The cost of that arrangement is that the two can drift.
//
// The server is the one place both are importable, so the guard lives here.
// These are compile-time assertions first (the file failing to typecheck IS
// the failure) with runtime checks for the parts types can't express.

describe("flip transport DTO stays compatible with the engine", () => {
  it("accepts every engine card shape as a card view", () => {
    // If the engine adds a card kind or widens a value, this stops compiling.
    const cards: FlipCardInstance[] = flipCards([
      "0", "12", "+2", "+4", "+6", "+8", "+10", "x2", "freeze", "flip3", "second-chance",
    ]);
    const views: readonly FlipCardView[] = cards;

    expect(views).toHaveLength(11);
  });

  it("produces a view assignable to FlipTableView from a real engine state", () => {
    const state = buildFlipGameState({
      players: [
        { id: "p0", name: "Dev" },
        { id: "p1", name: "Alice" },
      ],
    });
    const view: FlipTableView = toFlipTableView(state);

    expect(view.players).toHaveLength(2);
  });

  // The mapping's whole job is dropping these two. A regression here is a
  // information leak, not a cosmetic bug, so it is asserted on the serialised
  // payload rather than on the object — that is what actually reaches a client.
  it("never serialises the shoe or the discard pile", () => {
    const hand = flipCards(["7", "+4"]);
    const state = buildFlipGameState({
      players: [
        { id: "p0", name: "Dev" },
        { id: "p1", name: "Alice" },
      ],
      hands: { p0: hand },
    });

    const json = JSON.stringify(toFlipTableView(state));

    expect(json).not.toContain('"shoe"');
    expect(json).not.toContain('"discard"');
    // Every undrawn card id must be absent — the shoe is the round's future.
    for (const card of state.shoe.slice(0, 20)) {
      expect(json).not.toContain(card.id);
    }
    // The player's own face-up hand IS present: it is public (#358).
    expect(json).toContain(hand[0].id);
  });

  it("reports the shoe and discard as counts", () => {
    const state = buildFlipGameState({
      players: [
        { id: "p0", name: "Dev" },
        { id: "p1", name: "Alice" },
      ],
    });
    const view = toFlipTableView(state);

    expect(view.shoeRemaining).toBe(state.shoe.length);
    expect(view.discardCount).toBe(state.discard.length);
    expect(typeof view.shoeRemaining).toBe("number");
  });

  it("resolves dealerIndex to a dealerId so the client does no seat math", () => {
    const state = buildFlipGameState({
      players: [
        { id: "p0", name: "Dev" },
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" },
      ],
      dealerIndex: 2,
    });

    expect(toFlipTableView(state).dealerId).toBe("p2");
  });

  it("counts unique numbers per #358 — 0 counts, modifiers never do", () => {
    const state = buildFlipGameState({
      players: [
        { id: "p0", name: "Dev" },
        { id: "p1", name: "Alice" },
      ],
      hands: { p0: flipCards(["0", "3", "7", "x2", "+10"]) },
    });

    const dev = toFlipTableView(state).players.find((p) => p.id === "p0")!;
    expect(dev.uniqueNumberCount).toBe(3);
  });

  it("carries frozen and busted status through", () => {
    const state = buildFlipGameState({
      players: [
        { id: "p0", name: "Dev" },
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" },
      ],
      statuses: { p0: "frozen", p1: "busted" },
    });

    const view = toFlipTableView(state);
    expect(view.players.map((p) => p.status)).toEqual(["frozen", "busted", "active"]);
  });

  it("carries cumulative scores through", () => {
    const state = buildFlipGameState({
      players: [
        { id: "p0", name: "Dev" },
        { id: "p1", name: "Alice" },
      ],
      totalScores: { p0: 187, p1: 42 },
    });

    const view = toFlipTableView(state);
    expect(view.players.map((p) => p.totalScore)).toEqual([187, 42]);
  });

  describe("pending action-card target choice (survives reconnect)", () => {
    const pendingState = (kind: "freeze" | "flip3"): FlipGameState =>
      buildFlipGameState({
        players: [
          { id: "p0", name: "Dev" },
          { id: "p1", name: "Alice" },
          { id: "p2", name: "Bob" },
        ],
        statuses: { p2: "busted" },
        turnPlayerId: "p0",
        pendingAction: { kind },
      });

    it.each(["freeze", "flip3"] as const)("carries a pending %s with its flipper", (kind) => {
      const view = toFlipTableView(pendingState(kind));

      expect(view.pendingAction).toMatchObject({ kind, flipperId: "p0" });
    });

    // Eligibility is a rule (active seats only), resolved server-side so the
    // #363 picker renders a list rather than re-implementing it.
    it("pre-filters eligible targets to active seats, excluding busted ones", () => {
      const view = toFlipTableView(pendingState("flip3"));

      expect(view.pendingAction!.eligibleTargetIds).toEqual(["p0", "p1"]);
      expect(view.pendingAction!.eligibleTargetIds).not.toContain("p2");
    });

    it("is null when nothing is pending", () => {
      const state = buildFlipGameState({
        players: [
          { id: "p0", name: "Dev" },
          { id: "p1", name: "Alice" },
        ],
      });
      expect(toFlipTableView(state).pendingAction).toBeNull();
    });
  });

  it("carries an outstanding Flip 3 stack, so a mid-flip reconnect restores it", () => {
    const state = buildFlipGameState({
      players: [
        { id: "p0", name: "Dev" },
        { id: "p1", name: "Alice" },
      ],
      turnPlayerId: "p0",
      flip3Stack: [{ targetId: "p1", remaining: 2 }],
    });

    expect(toFlipTableView(state).flip3Stack).toEqual([{ targetId: "p1", remaining: 2 }]);
  });
});
