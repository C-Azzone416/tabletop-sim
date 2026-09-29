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

  // #435 — Wire Game's range moved from 2-4 to 3-5; asserted directly
  // against the registry value below (not a literal) for exactly the
  // reason the Flip test's comment gives.
  it("shows the player-count range for a variable-count game", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);
    const wireGame = GAME_REGISTRY.find((game) => game.id === "wire-game")!;
    const wireGameCard = screen.getByText("Wire Game").closest("button")!;
    expect(
      within(wireGameCard).getByText(`${wireGame.minPlayers}–${wireGame.maxPlayers} players`),
    ).toBeInTheDocument();
  });

  // #436 — Flip's floor moved from 2 to 3; asserted directly against the
  // registry value (not a literal) so this doesn't go stale the next time
  // the bound moves, the way the hardcoded server tests did.
  it("shows Flip's registry range, not a hardcoded one", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);
    const flip = GAME_REGISTRY.find((game) => game.id === "flip")!;
    const flipCard = screen.getByText("Flip").closest("button")!;
    expect(
      within(flipCard).getByText(`${flip.minPlayers}–${flip.maxPlayers} players`),
    ).toBeInTheDocument();
  });

  it("marks Spades as available Hot Seat play", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} />);
    const card = screen.getByText("Spades").closest("button")!;
    expect(card).not.toBeDisabled();
    expect(within(card).getByText("Hot Seat")).toBeInTheDocument();
    expect(within(card).getByText("1–4 players")).toBeInTheDocument();
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

  it("calls onSelect for local Spades without treating it as unavailable", () => {
    const onSelect = vi.fn();
    render(<GameSelectionGrid onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Spades").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      id: "spades",
      launchMode: "local",
      launchPath: "/spades/hot-seat",
    }));
  });

  it("disables every card when disabled prop is set", () => {
    render(<GameSelectionGrid onSelect={vi.fn()} disabled />);
    expect(screen.getByText("Wire Game").closest("button")).toBeDisabled();
  });
});
