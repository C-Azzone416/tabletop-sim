import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { GameSelectionGrid } from "../app/components/GameSelectionGrid";
import { GAME_REGISTRY } from "@tabletop/shared";

describe("GameSelectionGrid", () => {
  it("renders one card per registry entry, driven by the registry not a local list", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);
    for (const game of GAME_REGISTRY) {
      expect(screen.getByText(game.displayName)).toBeInTheDocument();
      expect(screen.getByText(game.description)).toBeInTheDocument();
    }
  });

  it("shows the player-count range for a variable-count game", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);
    expect(screen.getByText("2–4 players")).toBeInTheDocument();
  });

  it("marks an unavailable game as Coming soon and disabled", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);
    const spades = screen.getByText("Spades").closest("button")!;
    expect(spades).toBeDisabled();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("calls onSelect with the game when an available card is clicked", () => {
    const onSelect = vi.fn();
    render(<GameSelectionGrid onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Wire Game").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wire-game" }),
    );
  });

  it("does not call onSelect when an unavailable card is clicked", () => {
    const onSelect = vi.fn();
    render(<GameSelectionGrid onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Spades").closest("button")!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disables every card when disabled prop is set", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} disabled />);
    expect(screen.getByText("Wire Game").closest("button")).toBeDisabled();
  });
});
