import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupPhase } from "../app/components/SetupPhase";
import { makeGame, makePlayer, makeWire, resetIds } from "./fixtures";

describe("SetupPhase", () => {
  beforeEach(() => resetIds());

  const setup = () => {
    const game = makeGame({ id: "g1", status: "setup", currentTurnPlayerId: "p1", captainId: "p1" });
    const localPlayer = makePlayer({ id: "p1", name: "Alice" });
    const otherPlayer = makePlayer({ id: "p2", name: "Bob" });
    const localWires = [
      makeWire({ id: "w1", playerId: "p1", rackPosition: 0, value: "3" }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 1, value: "5" }),
    ];
    const otherWires = [
      makeWire({ id: "w3", playerId: "p2", rackPosition: 0, value: "2" }),
      makeWire({ id: "w4", playerId: "p2", rackPosition: 1, value: "4" }),
    ];
    const onPlaceInfoToken = vi.fn();
    const onSelectOpponentWire = vi.fn();
    const onAnswerWireQuestion = vi.fn();
    const onNextTurn = vi.fn();
    const onStartGame = vi.fn();

    return {
      game,
      players: [localPlayer, otherPlayer],
      wires: [...localWires, ...otherWires],
      localPlayerId: "p1",
      onPlaceInfoToken,
      onSelectOpponentWire,
      onAnswerWireQuestion,
      onNextTurn,
      onStartGame,
      pendingWireQuestion: null,
      lastInterrogationResult: null,
    };
  };

  it("renders setup phase heading", () => {
    render(<SetupPhase {...setup()} />);
    expect(screen.getByText("Setup Phase")).toBeInTheDocument();
  });

  it("labels local player rack as hidden", () => {
    render(<SetupPhase {...setup()} />);
    expect(screen.getByText("Your Rack (hidden from you)")).toBeInTheDocument();
  });

  it("shows other player name", () => {
    render(<SetupPhase {...setup()} />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows Place Info Token button after selecting a wire on another player rack", async () => {
    const user = userEvent.setup();
    const props = setup();
    render(<SetupPhase {...props} />);

    expect(screen.queryByText("Place Info Token")).not.toBeInTheDocument();

    const wireButtons = screen.getAllByRole("button");
    const otherPlayerWireButton = wireButtons.find(
      (btn) => btn.textContent?.includes("2") || btn.textContent?.includes("4")
    );
    if (otherPlayerWireButton) {
      await user.click(otherPlayerWireButton);
      expect(screen.getByText("Place Info Token")).toBeInTheDocument();
    }
  });

  it("calls onPlaceInfoToken when placing token", async () => {
    const user = userEvent.setup();
    const props = setup();
    render(<SetupPhase {...props} />);

    const wireButtons = screen.getAllByRole("button");
    const otherPlayerWireButton = wireButtons.find(
      (btn) => btn.textContent?.includes("2") || btn.textContent?.includes("4")
    );
    if (otherPlayerWireButton) {
      await user.click(otherPlayerWireButton);
      await user.click(screen.getByText("Place Info Token"));
      expect(props.onPlaceInfoToken).toHaveBeenCalledOnce();
    }
  });
});
