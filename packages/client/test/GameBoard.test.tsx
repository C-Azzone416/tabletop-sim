import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameBoard } from "../app/components/GameBoard";
import {
  makeGame,
  makePlayer,
  makeWire,
  makeValidationToken,
  makeTurn,
  resetIds,
} from "./fixtures";

describe("GameBoard", () => {
  beforeEach(() => resetIds());

  const setup = (overrides: Record<string, unknown> = {}) => {
    const game = makeGame({
      id: "g1",
      status: "active",
      captainId: "p1",
      currentTurnPlayerId: "p1",
      detonatorPosition: 1,
      detonatorMax: 4,
    });
    const localPlayer = makePlayer({ id: "p1", name: "Alice" });
    const otherPlayer = makePlayer({ id: "p2", name: "Bob" });
    const wires = [
      makeWire({ id: "w1", playerId: "p1", rackPosition: 0, value: null }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 1, value: null }),
      makeWire({ id: "w3", playerId: "p2", rackPosition: 0, value: "3" }),
      makeWire({ id: "w4", playerId: "p2", rackPosition: 1, value: "5" }),
    ];

    return {
      game,
      players: [localPlayer, otherPlayer],
      wires,
      infoTokens: [],
      validationTokens: [],
      localPlayerId: "p1",
      lastTurnResult: null,
      onDuoCut: vi.fn(),
      onSoloCut: vi.fn(),
      onDoubleDetector: vi.fn(),
      ...overrides,
    };
  };

  it("shows turn indicator for local player's turn", () => {
    render(<GameBoard {...setup()} />);
    expect(screen.getByText("Your turn — choose an action")).toBeInTheDocument();
  });

  it("shows waiting message when not local player's turn", () => {
    const props = setup();
    props.game = makeGame({
      ...props.game,
      currentTurnPlayerId: "p2",
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText("Waiting for Bob...")).toBeInTheDocument();
  });

  it("renders detonator with correct remaining count", () => {
    render(<GameBoard {...setup()} />);
    expect(screen.getByText("3 mistakes remaining")).toBeInTheDocument();
  });

  it("shows local player as 'You'", () => {
    render(<GameBoard {...setup()} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows other player name", () => {
    render(<GameBoard {...setup()} />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("marks captain", () => {
    render(<GameBoard {...setup()} />);
    expect(screen.getByText("Captain")).toBeInTheDocument();
  });

  it("marks active player", () => {
    render(<GameBoard {...setup()} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows success turn result", () => {
    const turn = makeTurn({ result: "success" });
    const props = setup({
      lastTurnResult: {
        type: "turn_result" as const,
        turn,
        game: makeGame({ status: "active" }),
        updatedWires: [],
      },
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText("Wire cut successfully!")).toBeInTheDocument();
  });

  it("shows fail turn result", () => {
    const turn = makeTurn({ result: "fail" });
    const props = setup({
      lastTurnResult: {
        type: "turn_result" as const,
        turn,
        game: makeGame({ status: "active" }),
        updatedWires: [],
      },
    });
    render(<GameBoard {...props} />);
    expect(
      screen.getByText("Wrong guess — detonator advances!")
    ).toBeInTheDocument();
  });

  it("shows explosion turn result", () => {
    const turn = makeTurn({ result: "explosion" });
    const props = setup({
      lastTurnResult: {
        type: "turn_result" as const,
        turn,
        game: makeGame({ status: "active" }),
        updatedWires: [],
      },
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText("BOOM!")).toBeInTheDocument();
  });

  it("shows action panel when it is local player's turn", () => {
    render(<GameBoard {...setup()} />);
    expect(screen.getByText("Choose Action")).toBeInTheDocument();
    expect(screen.getByText("Duo Cut")).toBeInTheDocument();
    expect(screen.getByText("Solo Cut")).toBeInTheDocument();
    expect(screen.getByText("Double Detector")).toBeInTheDocument();
  });

  it("hides action panel when not local player's turn", () => {
    const props = setup();
    props.game = makeGame({
      ...props.game,
      currentTurnPlayerId: "p2",
    });
    render(<GameBoard {...props} />);
    expect(screen.queryByText("Choose Action")).not.toBeInTheDocument();
  });

  it("renders validation tracker with validated values", () => {
    const props = setup({
      validationTokens: [
        makeValidationToken({ wireValue: "3" }),
        makeValidationToken({ wireValue: "5" }),
      ],
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText("Validated")).toBeInTheDocument();
  });
});
