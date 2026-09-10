import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PendingActionSlot } from "../../app/components/flip/PendingActionSlot";

describe("PendingActionSlot", () => {
  it("renders nothing when no action is pending", () => {
    const { container } = render(<PendingActionSlot pendingAction={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders default waiting copy for a freeze target choice", () => {
    render(<PendingActionSlot pendingAction={{ kind: "freeze" }} />);
    expect(screen.getByTestId("flip-pending-action")).toHaveAttribute(
      "data-pending-action-kind",
      "freeze",
    );
    expect(screen.getByText(/Freeze target/)).toBeInTheDocument();
  });

  it("renders #363's picker in place of the default copy when provided", () => {
    render(
      <PendingActionSlot pendingAction={{ kind: "flip3" }}>
        <button>Choose target</button>
      </PendingActionSlot>,
    );
    expect(screen.getByRole("button", { name: "Choose target" })).toBeInTheDocument();
    expect(screen.queryByText(/Waiting on/)).not.toBeInTheDocument();
  });
});
