import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lobby } from "../app/components/Lobby";
import { makePlayer, resetIds } from "./fixtures";

describe("Lobby", () => {
  beforeEach(() => resetIds());

  const defaultProps = () => {
    const captain = makePlayer({ id: "p1", name: "Alice" });
    const player2 = makePlayer({ id: "p2", name: "Bob" });
    return {
      joinCode: "XYZ789",
      players: [captain, player2],
      localPlayerId: "p1",
      captainId: "p1",
      onStartGame: vi.fn(),
    };
  };

  it("displays the join code", () => {
    render(<Lobby {...defaultProps()} />);
    expect(screen.getByText("XYZ789")).toBeInTheDocument();
  });

  it("displays all players", () => {
    render(<Lobby {...defaultProps()} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows player count", () => {
    render(<Lobby {...defaultProps()} />);
    expect(screen.getByText("Players (2/4)")).toBeInTheDocument();
  });

  it("marks the captain", () => {
    render(<Lobby {...defaultProps()} />);
    expect(screen.getByText("Captain")).toBeInTheDocument();
  });

  it("marks the local player with (you)", () => {
    render(<Lobby {...defaultProps()} />);
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("shows start button for captain with enough players", () => {
    render(<Lobby {...defaultProps()} />);
    const button = screen.getByRole("button", { name: /Start Mission/ });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("disables start button with only 1 player", () => {
    const props = defaultProps();
    props.players = [props.players[0]];
    render(<Lobby {...props} />);
    const button = screen.getByRole("button", { name: /Need \d+ more/ });
    expect(button).toBeDisabled();
  });

  it("calls onStartGame when captain clicks start", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<Lobby {...props} />);
    await user.click(screen.getByRole("button", { name: /Start Mission/ }));
    expect(props.onStartGame).toHaveBeenCalledWith(1);
  });

  it("shows waiting message for non-captain player", () => {
    const props = defaultProps();
    props.localPlayerId = "p2";
    render(<Lobby {...props} />);
    expect(
      screen.getByText("Waiting for the captain to start the game...")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Mission/ })).not.toBeInTheDocument();
  });
});
