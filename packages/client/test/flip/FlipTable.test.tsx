import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlipTable } from "../../app/components/flip/FlipTable";
import type { FlipGameState } from "../../app/components/flip/engine-types";

function makeGame(overrides: Partial<FlipGameState> = {}): FlipGameState {
  return {
    players: [
      { id: "p1", name: "Alice", status: "active", hand: [{ id: "c1", kind: "number", value: 5 }], totalScore: 0 },
      { id: "p2", name: "Bea", status: "active", hand: [], totalScore: 0 },
    ],
    dealerIndex: 0,
    roundNumber: 1,
    shoe: Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, kind: "number" as const, value: 1 })),
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

describe("FlipTable", () => {
  it("scopes the [data-game] token boundary to flip", () => {
    const { container } = render(
      <FlipTable game={makeGame()} localPlayerId="p1" onHit={vi.fn()} onFreeze={vi.fn()} />,
    );
    expect(container.querySelector('[data-game="flip"]')).toBeInTheDocument();
  });

  it("renders every seat's hand face up regardless of local player", () => {
    render(<FlipTable game={makeGame()} localPlayerId="p2" onHit={vi.fn()} onFreeze={vi.fn()} />);
    expect(screen.getByTestId("card-c1")).toBeInTheDocument();
  });

  it("shows Hit/Freeze only for the active local player", () => {
    render(<FlipTable game={makeGame()} localPlayerId="p1" onHit={vi.fn()} onFreeze={vi.fn()} />);
    expect(screen.getByTestId("turn-controls")).toBeInTheDocument();
  });

  it("hides Hit/Freeze for a non-active local player", () => {
    render(<FlipTable game={makeGame()} localPlayerId="p2" onHit={vi.fn()} onFreeze={vi.fn()} />);
    expect(screen.queryByTestId("turn-controls")).not.toBeInTheDocument();
  });

  it("calls onHit through to TurnControls", async () => {
    const user = userEvent.setup();
    const onHit = vi.fn();
    render(<FlipTable game={makeGame()} localPlayerId="p1" onHit={onHit} onFreeze={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Hit" }));
    expect(onHit).toHaveBeenCalledTimes(1);
  });

  it("shows the shoe count", () => {
    render(<FlipTable game={makeGame()} localPlayerId="p1" onHit={vi.fn()} onFreeze={vi.fn()} />);
    expect(screen.getByTestId("cards-remaining")).toHaveTextContent("20 cards left");
  });

  it("shows the pending-action slot and hides turn controls when a target choice is pending", () => {
    render(
      <FlipTable
        game={makeGame({ pendingAction: { kind: "flip3" } })}
        localPlayerId="p1"
        onHit={vi.fn()}
        onFreeze={vi.fn()}
      />,
    );
    expect(screen.getByTestId("flip-pending-action")).toBeInTheDocument();
    expect(screen.queryByTestId("turn-controls")).not.toBeInTheDocument();
  });

  it("toggles the play-surface flatten state via the flatten button", async () => {
    const user = userEvent.setup();
    render(<FlipTable game={makeGame()} localPlayerId="p1" onHit={vi.fn()} onFreeze={vi.fn()} />);
    const button = screen.getByRole("button", { name: /flatten table/i });
    await user.click(button);
    expect(screen.getByRole("button", { name: /tilt table/i })).toBeInTheDocument();
  });

  it("has no discard-browsing affordance", () => {
    render(<FlipTable game={makeGame()} localPlayerId="p1" onHit={vi.fn()} onFreeze={vi.fn()} />);
    expect(screen.queryByText(/discard/i)).not.toBeInTheDocument();
  });
});
