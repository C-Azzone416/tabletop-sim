import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DevPanel } from "../app/components/DevPanel";

describe("DevPanel", () => {
  const seats = [
    { name: "Dev", profileId: "p1" },
    { name: "Alice", profileId: "p2" },
    { name: "Bob", profileId: "p3" },
    { name: "Carol", profileId: "p4" },
  ];

  it("is collapsed by default, showing only the toggle", () => {
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Open dev tools" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alice" })).not.toBeInTheDocument();
    expect(screen.queryByText("Reveal All Tokens")).not.toBeInTheDocument();
  });

  it("expands to show seats and actions when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
        onSkipTurn={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    for (const seat of seats) {
      expect(screen.getByRole("button", { name: seat.name })).toBeInTheDocument();
    }
    expect(screen.getByText("Reveal All Tokens")).toBeInTheDocument();
    expect(screen.getByText("Skip Turn")).toBeInTheDocument();
  });

  it("collapses again when the close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    await user.click(screen.getByRole("button", { name: "Close dev tools" }));
    expect(screen.getByRole("button", { name: "Open dev tools" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alice" })).not.toBeInTheDocument();
  });

  it("disables the button for the currently active seat", async () => {
    const user = userEvent.setup();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p2"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    expect(screen.getByRole("button", { name: "Alice" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dev" })).not.toBeDisabled();
  });

  it("calls onSwitchSeat with the clicked seat", async () => {
    const user = userEvent.setup();
    const onSwitchSeat = vi.fn();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={onSwitchSeat}
        onRevealAllTokens={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    await user.click(screen.getByRole("button", { name: "Bob" }));
    expect(onSwitchSeat).toHaveBeenCalledWith({ name: "Bob", profileId: "p3" });
  });

  it("calls onRevealAllTokens when clicked", async () => {
    const user = userEvent.setup();
    const onRevealAllTokens = vi.fn();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={onRevealAllTokens}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    await user.click(screen.getByText("Reveal All Tokens"));
    expect(onRevealAllTokens).toHaveBeenCalledOnce();
  });

  it("calls onSkipTurn when clicked", async () => {
    const user = userEvent.setup();
    const onSkipTurn = vi.fn();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
        onSkipTurn={onSkipTurn}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    await user.click(screen.getByText("Skip Turn"));
    expect(onSkipTurn).toHaveBeenCalledOnce();
  });

  it("does not render Skip Turn when onSkipTurn is not provided", async () => {
    const user = userEvent.setup();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    expect(screen.queryByText("Skip Turn")).not.toBeInTheDocument();
  });

  it("does not render Reveal All Tokens when onRevealAllTokens is not provided", async () => {
    const user = userEvent.setup();
    render(
      <DevPanel seatOptions={seats} activeProfileId="p1" onSwitchSeat={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    expect(screen.queryByText("Reveal All Tokens")).not.toBeInTheDocument();
  });

  // #171: DevPanel sat at z-40 under GameOverOverlay's z-50 backdrop, making
  // the seat switcher unclickable during game-over. Pin both render states to
  // the overlay-topping layer so a styling pass can't silently sink it again.
  it("stacks above overlay backdrops (z-50) in both collapsed and open states", async () => {
    const user = userEvent.setup();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Open dev tools" });
    expect(toggle.className).toContain("z-[60]");
    await user.click(toggle);
    const panel = screen.getByText(/\[DEV\] Tools/).closest("div.fixed");
    expect(panel).not.toBeNull();
    expect((panel as HTMLElement).className).toContain("z-[60]");
  });

  // #183: the collapsed toggle at the old top-24 offset sat directly over
  // GameBoard's LIVES value in the status bar, hiding the number a dev
  // watches most during manual playtesting.
  it("sits below the game-board status bar (top-40, not top-24)", async () => {
    const user = userEvent.setup();
    render(
      <DevPanel
        seatOptions={seats}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Open dev tools" });
    expect(toggle.className).toContain("top-40");
    expect(toggle.className).not.toContain("top-24");
    await user.click(toggle);
    const panel = screen.getByText(/\[DEV\] Tools/).closest("div.fixed");
    expect((panel as HTMLElement).className).toContain("top-40");
  });

  it("does not render the seat section when seatOptions is empty", async () => {
    const user = userEvent.setup();
    render(
      <DevPanel
        seatOptions={[]}
        activeProfileId="p1"
        onSwitchSeat={vi.fn()}
        onRevealAllTokens={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open dev tools" }));
    expect(screen.queryByText("Seat:")).not.toBeInTheDocument();
  });
});
