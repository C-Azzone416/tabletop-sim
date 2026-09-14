import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveGameWarning } from "../app/components/LeaveGameWarning";

// #432 — the only exit from an active Wire game, deliberately heavier than
// Flip's plain confirm (#434): a non-host leave ends the mission for
// everyone, and a host leave closes the room outright. The copy must
// distinguish those two, not just ask "are you sure?".
describe("LeaveGameWarning", () => {
  it("warns a non-host that the mission ends for everyone, room stays open", () => {
    render(<LeaveGameWarning isCaptain={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/end the mission for everyone/i)).toBeInTheDocument();
    expect(screen.getByText(/room stays open/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End the Mission" })).toBeInTheDocument();
  });

  it("warns a captain that leaving closes the room for everyone, not just ends the mission", () => {
    render(<LeaveGameWarning isCaptain={true} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/close the room for everyone/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be continued/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close the Room" })).toBeInTheDocument();
  });

  it("calls onConfirm and onCancel from their respective buttons", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<LeaveGameWarning isCaptain={false} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "End the Mission" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("renders as a modal alertdialog", () => {
    render(<LeaveGameWarning isCaptain={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
