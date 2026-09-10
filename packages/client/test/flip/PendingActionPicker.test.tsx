import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendingActionPicker } from "../../app/components/flip/PendingActionPicker";
import { FlipTable } from "../../app/components/flip/FlipTable";
import type { FlipGameState } from "../../app/components/flip/engine-types";

function baseGame(overrides: Partial<FlipGameState> = {}): FlipGameState {
  return {
    players: [
      { id: "a", name: "Alice", status: "active", hand: [], totalScore: 0 },
      { id: "b", name: "Bob", status: "active", hand: [], totalScore: 0 },
      { id: "c", name: "Cara", status: "active", hand: [], totalScore: 0 },
    ],
    dealerIndex: 0,
    roundNumber: 1,
    shoe: [],
    discard: [],
    phase: "round-in-progress",
    turnPlayerId: "a",
    pendingAction: { kind: "freeze" },
    flip3Stack: [],
    lastRoundResult: null,
    winnerId: null,
    resolutionLog: [],
    ...overrides,
  };
}

describe("PendingActionPicker", () => {
  it("renders nothing when there is no pending action", () => {
    const { container } = render(
      <PendingActionPicker
        game={baseGame({ pendingAction: null })}
        localPlayerId="a"
        onChooseFreezeTarget={vi.fn()}
        onChooseFlip3Target={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the flipper a target picker restricted to active players, with its own icon and label", () => {
    render(
      <PendingActionPicker
        game={baseGame({
          pendingAction: { kind: "freeze" },
          players: [
            { id: "a", name: "Alice", status: "active", hand: [], totalScore: 0 },
            { id: "b", name: "Bob", status: "frozen", hand: [], totalScore: 0 },
            { id: "c", name: "Cara", status: "active", hand: [], totalScore: 0 },
          ],
        })}
        localPlayerId="a"
        onChooseFreezeTarget={vi.fn()}
        onChooseFlip3Target={vi.fn()}
      />,
    );

    expect(screen.getByText(/Freeze/)).toBeInTheDocument();
    expect(screen.getByText("Yourself")).toBeInTheDocument();
    expect(screen.getByText("Cara")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("shows non-flippers who is choosing, not a picker", () => {
    render(
      <PendingActionPicker
        game={baseGame({ turnPlayerId: "a" })}
        localPlayerId="b"
        onChooseFreezeTarget={vi.fn()}
        onChooseFlip3Target={vi.fn()}
      />,
    );

    expect(screen.getByText(/Alice is choosing a target/)).toBeInTheDocument();
    expect(screen.queryByTestId("flip-target-picker")).not.toBeInTheDocument();
  });

  it("forces self-target when the flipper is the only eligible player", () => {
    render(
      <PendingActionPicker
        game={baseGame({
          turnPlayerId: "a",
          pendingAction: { kind: "flip3" },
          players: [
            { id: "a", name: "Alice", status: "active", hand: [], totalScore: 0 },
            { id: "b", name: "Bob", status: "frozen", hand: [], totalScore: 0 },
            { id: "c", name: "Cara", status: "busted", hand: [], totalScore: 0 },
          ],
        })}
        localPlayerId="a"
        onChooseFreezeTarget={vi.fn()}
        onChooseFlip3Target={vi.fn()}
      />,
    );

    const picker = screen.getByTestId("flip-target-picker");
    expect(picker).toHaveTextContent("Yourself");
    expect(picker).not.toHaveTextContent("Bob");
    expect(picker).not.toHaveTextContent("Cara");
    expect(screen.getByText(/only eligible player/i)).toBeInTheDocument();
  });

  it("calls onChooseFreezeTarget with the chosen target id", async () => {
    const onChooseFreezeTarget = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingActionPicker
        game={baseGame({ pendingAction: { kind: "freeze" } })}
        localPlayerId="a"
        onChooseFreezeTarget={onChooseFreezeTarget}
        onChooseFlip3Target={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bob" }));
    expect(onChooseFreezeTarget).toHaveBeenCalledWith("b");
  });

  it("calls onChooseFlip3Target, not onChooseFreezeTarget, when the pending action is flip3", async () => {
    const onChooseFlip3Target = vi.fn();
    const onChooseFreezeTarget = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingActionPicker
        game={baseGame({ pendingAction: { kind: "flip3" } })}
        localPlayerId="a"
        onChooseFreezeTarget={onChooseFreezeTarget}
        onChooseFlip3Target={onChooseFlip3Target}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bob" }));
    expect(onChooseFlip3Target).toHaveBeenCalledWith("b");
    expect(onChooseFreezeTarget).not.toHaveBeenCalled();
  });

  it("narrates the most recent resolutionLog event — a bust stop condition", () => {
    render(
      <PendingActionPicker
        game={baseGame({
          resolutionLog: [
            { targetId: "b", card: { id: "1", kind: "number", value: 5 }, effect: "number-busted", context: "flip3" },
          ],
        })}
        localPlayerId="a"
        onChooseFreezeTarget={vi.fn()}
        onChooseFlip3Target={vi.fn()}
      />,
    );

    expect(screen.getByTestId("flip-pending-action-narration")).toHaveTextContent(/busted/i);
  });

  it("narrates a Second Chance save as continuing, not stopping", () => {
    render(
      <PendingActionPicker
        game={baseGame({
          resolutionLog: [
            { targetId: "b", card: { id: "1", kind: "number", value: 5 }, effect: "number-saved", context: "flip3" },
          ],
        })}
        localPlayerId="a"
        onChooseFreezeTarget={vi.fn()}
        onChooseFlip3Target={vi.fn()}
      />,
    );

    expect(screen.getByTestId("flip-pending-action-narration")).toHaveTextContent(/continues/i);
  });
});

describe("PendingActionPicker mounted into FlipTable's pendingActionUi slot", () => {
  it("renders inside PendingActionSlot and a click reaches the FlipTable-level handler", async () => {
    const onChooseFreezeTarget = vi.fn();
    const game = baseGame({ pendingAction: { kind: "freeze" } });
    const user = userEvent.setup();

    render(
      <FlipTable
        game={game}
        localPlayerId="a"
        onHit={vi.fn()}
        onFreeze={vi.fn()}
        pendingActionUi={
          <PendingActionPicker
            game={game}
            localPlayerId="a"
            onChooseFreezeTarget={onChooseFreezeTarget}
            onChooseFlip3Target={vi.fn()}
          />
        }
      />,
    );

    const slot = screen.getByTestId("flip-pending-action");
    expect(slot).toHaveAttribute("data-pending-action-kind", "freeze");
    expect(screen.getByTestId("flip-pending-action-picker")).toBeInTheDocument();
    // Hit/Freeze controls must not show while a target choice is pending (#362 contract).
    expect(screen.queryByTestId("turn-controls")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bob" }));
    expect(onChooseFreezeTarget).toHaveBeenCalledWith("b");
  });
});
