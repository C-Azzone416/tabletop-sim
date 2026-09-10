import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TurnControls } from "../../app/components/flip/TurnControls";

describe("TurnControls", () => {
  it("renders nothing when it isn't the local player's turn", () => {
    const { container } = render(
      <TurnControls isMyTurn={false} pendingAction={null} onHit={vi.fn()} onFreeze={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while a target choice is pending, even on my turn", () => {
    const { container } = render(
      <TurnControls
        isMyTurn
        pendingAction={{ kind: "freeze" }}
        onHit={vi.fn()}
        onFreeze={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders Hit and Freeze on the active player's turn", () => {
    render(<TurnControls isMyTurn pendingAction={null} onHit={vi.fn()} onFreeze={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Hit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Freeze" })).toBeInTheDocument();
  });

  it("calls onHit / onFreeze on click", async () => {
    const user = userEvent.setup();
    const onHit = vi.fn();
    const onFreeze = vi.fn();
    render(<TurnControls isMyTurn pendingAction={null} onHit={onHit} onFreeze={onFreeze} />);
    await user.click(screen.getByRole("button", { name: "Hit" }));
    await user.click(screen.getByRole("button", { name: "Freeze" }));
    expect(onHit).toHaveBeenCalledTimes(1);
    expect(onFreeze).toHaveBeenCalledTimes(1);
  });
});
