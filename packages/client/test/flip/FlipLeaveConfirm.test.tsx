import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlipLeaveConfirm } from "../../app/components/flip/FlipLeaveConfirm";

// #434 — the only exit from an active Flip game. Deliberately lighter than
// Wire's LeaveGameWarning (#432) for a non-host: it costs the other
// players nothing, so the copy and styling say so, not "are you sure?".
// The captain branch is still heavier — #431's room-closes rule is
// unconditional and identical across every game.
describe("FlipLeaveConfirm", () => {
  it("shows the light, reassuring copy for a non-captain", () => {
    render(<FlipLeaveConfirm isCaptain={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/play continues for everyone else/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    // Not the heavier captain copy.
    expect(screen.queryByText(/close the room for everyone/i)).not.toBeInTheDocument();
  });

  it("shows the heavier room-closes copy for the captain", () => {
    render(<FlipLeaveConfirm isCaptain={true} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/close the room for everyone/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close the Room" })).toBeInTheDocument();
  });

  it("calls onConfirm and onCancel from their respective buttons", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<FlipLeaveConfirm isCaptain={false} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("renders as a modal alertdialog", () => {
    render(<FlipLeaveConfirm isCaptain={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
