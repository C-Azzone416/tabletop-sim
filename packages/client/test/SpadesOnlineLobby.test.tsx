import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SpadesOnlineLobby } from "../app/components/spades/SpadesOnlineLobby";
import { makePlayer } from "./fixtures";

describe("SpadesOnlineLobby", () => {
  it("lets the host configure bot seats and start once every human is ready", () => {
    const onStart = vi.fn();
    const host = makePlayer({ id: "host", name: "Alice", ready: true });

    render(
      <SpadesOnlineLobby
        players={[host]}
        localPlayerId="host"
        captainId="host"
        onReady={vi.fn()}
        onLeave={vi.fn()}
        onStart={onStart}
      />,
    );

    expect(screen.getByText("Computer seats (3)")).toBeInTheDocument();
    const difficultySelectors = screen.getAllByRole("combobox");
    fireEvent.change(difficultySelectors[0], { target: { value: "hard" } });
    fireEvent.click(screen.getByRole("button", { name: "500" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Spades" }));

    expect(onStart).toHaveBeenCalledWith(500, ["hard", "normal", "normal"]);
  });

  it("keeps start controls private to the host and exposes ready/leave actions", () => {
    const onReady = vi.fn();
    const onLeave = vi.fn();
    const guest = makePlayer({ id: "guest", name: "Bob", ready: false });

    render(
      <SpadesOnlineLobby
        players={[makePlayer({ id: "host", name: "Alice", ready: true }), guest]}
        localPlayerId="guest"
        captainId="host"
        onReady={onReady}
        onLeave={onLeave}
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Start Spades" })).toBeNull();
    expect(screen.queryByText(/Computer seats/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I’m Ready" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave room" }));
    expect(onReady).toHaveBeenCalledOnce();
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
