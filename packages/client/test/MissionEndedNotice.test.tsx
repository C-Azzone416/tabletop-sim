import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MissionEndedNotice } from "../app/components/MissionEndedNotice";

// #432 — the non-host mid-game leave case for Wire Game: the room
// survives, so dismissing this reveals the Lobby rather than navigating
// anywhere — contrast with RoomClosedNotice's "Back to Play" navigation.
describe("MissionEndedNotice", () => {
  it("renders the given reason and a reassurance that the room is still there", () => {
    render(<MissionEndedNotice reason="Bob left. The mission has ended." onDismiss={vi.fn()} />);
    expect(screen.getByText("Mission Ended")).toBeInTheDocument();
    expect(screen.getByText("Bob left. The mission has ended.")).toBeInTheDocument();
    expect(screen.getByText(/back in the lobby/i)).toBeInTheDocument();
  });

  it("calls onDismiss, not a navigation, when Continue is clicked", () => {
    const onDismiss = vi.fn();
    render(<MissionEndedNotice reason="Bob left. The mission has ended." onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
