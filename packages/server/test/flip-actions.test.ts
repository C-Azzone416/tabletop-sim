import { describe, it, expect } from "vitest";
import { buildFlipDeck, buildFlipGameState, flipCards, type FlipGameState } from "@tabletop/game-flip";
import { applyFlipAction } from "../src/ws/flip-actions.js";

// #387 — authorization is the point of this file.
//
// applyFlipAction takes the *authenticated* player id as an argument rather
// than reading it from a message, which is what makes these rules testable
// without a socket. In production that argument is the id bound to the
// connection at authentication; no ClientMessage variant carries one, so a
// client has no way to supply it.

const seats = [
  { id: "p0", name: "Dev" },
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
];

// Turn belongs to p1 throughout unless a test says otherwise.
const liveState = (over: Parameters<typeof buildFlipGameState>[0] extends infer T ? Partial<T> : never = {}): FlipGameState =>
  buildFlipGameState({
    players: seats,
    hands: { p1: flipCards(["4"]) },
    turnPlayerId: "p1",
    ...over,
  } as Parameters<typeof buildFlipGameState>[0]);

describe("applyFlipAction — turn ownership", () => {
  it.each(["hit", "freeze"] as const)("lets the turn player %s", (kind) => {
    const next = applyFlipAction(liveState(), "p1", { kind });
    expect(next).toBeDefined();
  });

  // The core out-of-turn rejection.
  it.each(["hit", "freeze"] as const)("rejects %s from a player whose turn it is not", (kind) => {
    expect(() => applyFlipAction(liveState(), "p2", { kind })).toThrow("Not your turn");
  });

  it("rejects an action from someone not seated at the table at all", () => {
    expect(() => applyFlipAction(liveState(), "stranger", { kind: "hit" })).toThrow("Not your turn");
  });

  it("rejects any action when no round is in progress", () => {
    const state = buildFlipGameState({ players: seats, phase: "awaiting-round-start" });
    expect(() => applyFlipAction(state, "p1", { kind: "hit" })).toThrow("No round is in progress");
  });

  // A drawn action card must be resolved before play continues, or a player
  // could hit again and skip their own pending Freeze/Flip 3.
  it("rejects a hit while an action card is awaiting its target", () => {
    const state = liveState({ pendingAction: { kind: "flip3" } });
    expect(() => applyFlipAction(state, "p1", { kind: "hit" })).toThrow(
      "Resolve the pending action card first",
    );
  });
});

describe("applyFlipAction — target choice authorization", () => {
  const pending = (kind: "freeze" | "flip3", over = {}): FlipGameState =>
    buildFlipGameState({
      players: seats,
      turnPlayerId: "p1",
      pendingAction: { kind },
      ...over,
    });

  it.each(["freeze", "flip3"] as const)("lets the flipper choose a %s target", (kind) => {
    const action = kind === "freeze"
      ? ({ kind: "choose-freeze-target", targetPlayerId: "p2" } as const)
      : ({ kind: "choose-flip3-target", targetPlayerId: "p2" } as const);

    expect(applyFlipAction(pending(kind), "p1", action)).toBeDefined();
  });

  // Only the flipper chooses — not the target, and not a bystander.
  it.each(["p0", "p2"] as const)("rejects a target choice from non-flipper %s", (actor) => {
    expect(() =>
      applyFlipAction(pending("flip3"), actor, { kind: "choose-flip3-target", targetPlayerId: "p2" }),
    ).toThrow("Only the player who flipped the card may choose its target");
  });

  it("rejects a target choice when nothing is pending", () => {
    expect(() =>
      applyFlipAction(liveState(), "p1", { kind: "choose-flip3-target", targetPlayerId: "p2" }),
    ).toThrow("No action card is awaiting a target");
  });

  // A mismatched pair would otherwise silently apply the wrong effect.
  it("rejects a Freeze choice while a Flip 3 is pending", () => {
    expect(() =>
      applyFlipAction(pending("flip3"), "p1", { kind: "choose-freeze-target", targetPlayerId: "p2" }),
    ).toThrow("Flip 3 target is awaited");
  });

  it("rejects a Flip 3 choice while a Freeze is pending", () => {
    expect(() =>
      applyFlipAction(pending("freeze"), "p1", { kind: "choose-flip3-target", targetPlayerId: "p2" }),
    ).toThrow("Freeze target is awaited");
  });
});

describe("applyFlipAction — target legality is the engine's call, not the client's", () => {
  const withStatuses = (statuses: Record<string, "active" | "frozen" | "busted">): FlipGameState =>
    buildFlipGameState({
      players: seats,
      turnPlayerId: "p1",
      pendingAction: { kind: "flip3" },
      statuses,
    });

  it.each(["frozen", "busted"] as const)("rejects a %s player as a target", (status) => {
    expect(() =>
      applyFlipAction(withStatuses({ p2: status }), "p1", {
        kind: "choose-flip3-target",
        targetPlayerId: "p2",
      }),
    ).toThrow("not a legal target");
  });

  it("rejects an unknown player id as a target", () => {
    expect(() =>
      applyFlipAction(withStatuses({}), "p1", {
        kind: "choose-flip3-target",
        targetPlayerId: "p9-from-another-game",
      }),
    ).toThrow("not a legal target");
  });

  // #358: the flipper may target themselves, and must when they are the only
  // eligible player.
  it("allows the flipper to target themselves", () => {
    expect(
      applyFlipAction(withStatuses({}), "p1", {
        kind: "choose-flip3-target",
        targetPlayerId: "p1",
      }),
    ).toBeDefined();
  });

  it("allows self-target when the flipper is the only eligible player", () => {
    const state = withStatuses({ p0: "busted", p2: "frozen" });
    expect(
      applyFlipAction(state, "p1", { kind: "choose-flip3-target", targetPlayerId: "p1" }),
    ).toBeDefined();
  });

  it("rejects the only other seats when they are frozen or busted", () => {
    const state = withStatuses({ p0: "busted", p2: "frozen" });
    for (const target of ["p0", "p2"]) {
      expect(() =>
        applyFlipAction(state, "p1", { kind: "choose-flip3-target", targetPlayerId: target }),
      ).toThrow("not a legal target");
    }
  });
});

describe("applyFlipAction — the action actually advances the game", () => {
  // Explicit shoe, because buildFlipGameState shuffles the auto-filled one:
  // with a random top card a hit can legitimately bust the player and empty
  // their hand, which made an earlier version of this test flaky. The engine
  // validates the full 94-card set, so the rest of the deck goes in behind.
  const stackedOnTop = (topSpec: string, handSpecs: string[]) => {
    const hand = flipCards(handSpecs);
    const top = flipCards([topSpec]);
    const rest = buildFlipDeck("rest");
    for (const card of [...hand, ...top]) {
      const i = rest.findIndex((c) => JSON.stringify({ ...c, id: 0 }) === JSON.stringify({ ...card, id: 0 }));
      rest.splice(i, 1);
    }
    return buildFlipGameState({
      players: seats,
      hands: { p1: hand },
      shoe: [...top, ...rest],
      turnPlayerId: "p1",
    });
  };

  it("a hit draws the top card into the actor's hand", () => {
    // 5 into a hand holding 4: no duplicate, so it lands and cannot bust.
    const before = stackedOnTop("5", ["4"]);
    const after = applyFlipAction(before, "p1", { kind: "hit" });

    const hand = after.players.find((p) => p.id === "p1")!.hand;
    expect(hand).toHaveLength(2);
    expect(hand.some((c) => c.kind === "number" && c.value === 5)).toBe(true);
    expect(after.shoe).toHaveLength(before.shoe.length - 1);
  });

  it("a hit on a duplicate busts the actor and discards the hand", () => {
    const before = stackedOnTop("4", ["4"]);
    const after = applyFlipAction(before, "p1", { kind: "hit" });

    expect(after.players.find((p) => p.id === "p1")!.status).toBe("busted");
  });

  it("a freeze locks the actor and passes the turn on", () => {
    const after = applyFlipAction(liveState(), "p1", { kind: "freeze" });

    expect(after.players.find((p) => p.id === "p1")!.status).toBe("frozen");
    expect(after.turnPlayerId).not.toBe("p1");
  });

  it("choosing a Freeze target freezes that player, not the flipper", () => {
    const state = buildFlipGameState({
      players: seats,
      turnPlayerId: "p1",
      pendingAction: { kind: "freeze" },
    });

    const after = applyFlipAction(state, "p1", {
      kind: "choose-freeze-target",
      targetPlayerId: "p2",
    });

    expect(after.players.find((p) => p.id === "p2")!.status).toBe("frozen");
    expect(after.pendingAction).toBeNull();
  });

  it("leaves the input state untouched — the engine is pure", () => {
    const before = liveState();
    const snapshot = JSON.stringify(before);

    applyFlipAction(before, "p1", { kind: "hit" });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("applyFlipAction — start-round (#358: the dealer triggers each round)", () => {
  const awaitingState = (over: Parameters<typeof buildFlipGameState>[0] extends infer T ? Partial<T> : never = {}): FlipGameState =>
    buildFlipGameState({
      players: seats,
      phase: "awaiting-round-start",
      dealerIndex: 0,
      ...over,
    } as Parameters<typeof buildFlipGameState>[0]);

  it("lets the dealer start the round", () => {
    const next = applyFlipAction(awaitingState(), "p0", { kind: "start-round" });
    expect(next.phase).toBe("round-in-progress");
  });

  it("rejects a non-dealer trying to start the round", () => {
    expect(() => applyFlipAction(awaitingState(), "p1", { kind: "start-round" })).toThrow(
      "only the dealer can start the round",
    );
  });

  it("rejects starting a round that is already in progress", () => {
    expect(() => applyFlipAction(liveState(), "p0", { kind: "start-round" })).toThrow(
      "a round cannot be started right now",
    );
  });
});
