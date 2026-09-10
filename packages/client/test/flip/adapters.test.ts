import { describe, it, expect } from "vitest";
import { toSeats } from "../../app/components/flip/adapters";
import type { FlipGameState } from "../../app/components/flip/engine-types";

function makeGame(overrides: Partial<FlipGameState> = {}): FlipGameState {
  return {
    players: [
      { id: "p1", name: "Alice", status: "active", hand: [], totalScore: 0 },
      { id: "p2", name: "Bea", status: "frozen", hand: [{ id: "c1", kind: "number", value: 4 }], totalScore: 10 },
    ],
    dealerIndex: 1,
    roundNumber: 1,
    shoe: [],
    discard: [],
    phase: "round-in-progress",
    turnPlayerId: "p1",
    pendingAction: null,
    flip3Stack: [],
    lastRoundResult: null,
    winnerId: null,
    ...overrides,
  };
}

describe("toSeats", () => {
  it("maps players to seats in array order with turn-order index", () => {
    const seats = toSeats(makeGame());
    expect(seats.map((s) => s.order)).toEqual([0, 1]);
  });

  it("marks the seat matching turnPlayerId as active", () => {
    const seats = toSeats(makeGame());
    expect(seats.find((s) => s.id === "p1")?.isActive).toBe(true);
    expect(seats.find((s) => s.id === "p2")?.isActive).toBe(false);
  });

  it("marks the seat at dealerIndex as dealer", () => {
    const seats = toSeats(makeGame({ dealerIndex: 0 }));
    expect(seats[0].isDealer).toBe(true);
    expect(seats[1].isDealer).toBe(false);
  });

  it("maps player status to isFrozen/isBusted", () => {
    const seats = toSeats(makeGame());
    expect(seats.find((s) => s.id === "p2")?.isFrozen).toBe(true);
    expect(seats.find((s) => s.id === "p1")?.isFrozen).toBe(false);
  });

  it("uses hand length as cardCount", () => {
    const seats = toSeats(makeGame());
    expect(seats.find((s) => s.id === "p2")?.cardCount).toBe(1);
  });
});
