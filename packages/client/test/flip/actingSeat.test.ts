import { describe, it, expect } from "vitest";
import { actingPlayerId, type ActingSeatFlipView } from "../../app/components/flip/actingSeat";

function flip(overrides: Partial<ActingSeatFlipView> = {}): ActingSeatFlipView {
  return {
    phase: "round-in-progress",
    dealerId: "dealer-1",
    turnPlayerId: "turn-1",
    pendingAction: null,
    ...overrides,
  };
}

describe("actingPlayerId", () => {
  it("is the flipper when a target choice is pending, even though they aren't the turn-holder", () => {
    expect(
      actingPlayerId(
        flip({ turnPlayerId: "turn-1", pendingAction: { flipperId: "bob" } }),
      ),
    ).toBe("bob");
  });

  it("is the turn-holder during round-in-progress with no pending action", () => {
    expect(actingPlayerId(flip({ turnPlayerId: "alice" }))).toBe("alice");
  });

  it("is the dealer during awaiting-round-start", () => {
    expect(
      actingPlayerId(flip({ phase: "awaiting-round-start", dealerId: "dealer-2", turnPlayerId: null })),
    ).toBe("dealer-2");
  });

  it("is null during round-over — nobody owes an action, the view holds still", () => {
    expect(actingPlayerId(flip({ phase: "round-over", turnPlayerId: null }))).toBeNull();
  });

  it("is null during game-over — nobody owes an action, the view holds still", () => {
    expect(actingPlayerId(flip({ phase: "game-over", turnPlayerId: null }))).toBeNull();
  });

  it("pendingAction takes priority over the round boundary too", () => {
    expect(
      actingPlayerId(
        flip({ phase: "awaiting-round-start", dealerId: "dealer-1", pendingAction: { flipperId: "carol" } }),
      ),
    ).toBe("carol");
  });
});
