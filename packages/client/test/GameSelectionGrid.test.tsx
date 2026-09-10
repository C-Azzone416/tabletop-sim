import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  // Scoped to each unavailable game's own card rather than a document-wide
  // text query: there is more than one unavailable game now (#361 added flip
  // alongside spades), and a global getByText would break again on the next
  // one. Asserting per-card is also the stronger check — it proves the badge
  // sits on the disabled card, not merely somewhere on the page.
  it("marks every unavailable game as Coming soon and disabled", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);

    const unavailable = GAME_REGISTRY.filter((game) => !game.available);
    expect(unavailable.length).toBeGreaterThan(0);

    for (const game of unavailable) {
      const card = screen.getByText(game.displayName).closest("button")!;
      expect(card).toBeDisabled();
      expect(within(card).getByText("Coming soon")).toBeInTheDocument();
    }
  });

  // The other half of the #311 ruling: unavailable games are greyed, never
  // hidden, so every registry entry must have a card at all.
  it("renders a card for every registered game, available or not", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);
    for (const game of GAME_REGISTRY) {
      expect(screen.getByText(game.displayName).closest("button")).toBeTruthy();
    }
  });

  it("does not mark an available game as Coming soon", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);
    const wireGame = screen.getByText("Wire Game").closest("button")!;
    expect(wireGame).not.toBeDisabled();
    expect(within(wireGame).queryByText("Coming soon")).toBeNull();
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
