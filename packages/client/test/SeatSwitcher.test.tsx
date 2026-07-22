import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeatSwitcher } from "../app/components/SeatSwitcher";

describe("SeatSwitcher", () => {
  const seats = [
    { name: "Dev", profileId: "p1" },
    { name: "Alice", profileId: "p2" },
    { name: "Bob", profileId: "p3" },
    { name: "Carol", profileId: "p4" },
  ];

  it("renders a button for every seat", () => {
    render(<SeatSwitcher seats={seats} activeProfileId="p1" onSwitch={vi.fn()} />);
    for (const seat of seats) {
      expect(screen.getByRole("button", { name: seat.name })).toBeInTheDocument();
    }
  });

  it("disables the button for the currently active seat", () => {
    render(<SeatSwitcher seats={seats} activeProfileId="p2" onSwitch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Alice" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dev" })).not.toBeDisabled();
  });

  it("calls onSwitch with the clicked seat", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<SeatSwitcher seats={seats} activeProfileId="p1" onSwitch={onSwitch} />);
    await user.click(screen.getByRole("button", { name: "Bob" }));
    expect(onSwitch).toHaveBeenCalledWith({ name: "Bob", profileId: "p3" });
  });

  it("does not call onSwitch when clicking the already-active seat (disabled)", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<SeatSwitcher seats={seats} activeProfileId="p1" onSwitch={onSwitch} />);
    await user.click(screen.getByRole("button", { name: "Dev" }));
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
