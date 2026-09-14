import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { GameRegistryEntry } from "@tabletop/shared";
import { PlayerCountPicker } from "../app/components/PlayerCountPicker";

function makeGame(overrides: Partial<GameRegistryEntry> = {}): GameRegistryEntry {
  return {
    id: "wire-game",
    displayName: "Wire Game",
    description: "test",
    minPlayers: 2,
    maxPlayers: 4,
    available: true,
    ...overrides,
  };
}

describe("PlayerCountPicker", () => {
  it("shows a fixed-size game's count as a statement, not a control", () => {
    const game = makeGame({ id: "spades", displayName: "Spades", minPlayers: 4, maxPlayers: 4 });
    render(<PlayerCountPicker game={game} value={4} onChange={vi.fn()} />);

    expect(screen.getByText("4 players")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders one button per count in the registry's range for a variable-size game", () => {
    const game = makeGame({ minPlayers: 2, maxPlayers: 5 });
    render(<PlayerCountPicker game={game} value={2} onChange={vi.fn()} />);

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("marks the selected count with aria-pressed and calls onChange when another is clicked", () => {
    const onChange = vi.fn();
    const game = makeGame({ minPlayers: 2, maxPlayers: 4 });
    render(<PlayerCountPicker game={game} value={2} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("disables the buttons when disabled is set", () => {
    const game = makeGame({ minPlayers: 2, maxPlayers: 4 });
    render(<PlayerCountPicker game={game} value={2} onChange={vi.fn()} disabled />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
