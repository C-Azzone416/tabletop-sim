import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameBoard } from "../app/components/GameBoard";
import {
  makeGame,
  makePlayer,
  makeWire,
  makeInfoToken,
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
      makeWire({ id: "w1", playerId: "p1", rackPosition: 1, value: null }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 2, value: null }),
      makeWire({ id: "w3", playerId: "p2", rackPosition: 1, value: "3" }),
      makeWire({ id: "w4", playerId: "p2", rackPosition: 2, value: "5" }),
    ];

    return {
      game,
      players: [localPlayer, otherPlayer],
      wires,
      infoTokens: [],
      validationTokens: [],
      localPlayerId: "p1",
      lastTurnResult: null,
      pendingDualCut: null,
      pendingDualCutCorrect: null,
      onProposeDualCut: vi.fn(),
      onRespondDualCut: vi.fn(),
      onCompleteDualCut: vi.fn(),
      onSoloCut: vi.fn(),
      onDoubleDetector: vi.fn(),
      onRevealReds: vi.fn(),
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
    expect(screen.getByText("Dual Cut")).toBeInTheDocument();
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

  // Helper: get the rack container div for a given player label
  const getRackContainer = (label: string) => {
    const span = screen.getByText(label);
    // label span → flex div → outer player div
    return span.closest("div")!.parentElement!;
  };

  // --- Dual Cut UX ---

  it("entering dual_cut mode shows instruction text", async () => {
    const user = userEvent.setup();
    render(<GameBoard {...setup()} />);
    await user.click(screen.getByRole("button", { name: "Dual Cut" }));
    expect(
      screen.getByText(/Click an opponent's wire.*guess its value/i)
    ).toBeInTheDocument();
  });

  it("clicking opponent wire in dual_cut mode opens guess popup", async () => {
    const user = userEvent.setup();
    const props = setup();
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Dual Cut" }));
    const bobContainer = getRackContainer("Bob");
    const bobWireButtons = within(bobContainer).getAllByRole("button");
    await user.click(bobWireButtons[0]);
    expect(screen.getByText(/Guess the value of Bob's wire #1/i)).toBeInTheDocument();
  });

  it("guess popup Propose Cut calls onProposeDualCut with wire id and guess", async () => {
    const user = userEvent.setup();
    const props = setup();
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Dual Cut" }));
    const bobContainer = getRackContainer("Bob");
    await user.click(within(bobContainer).getAllByRole("button")[0]); // w3
    await user.type(screen.getByPlaceholderText("Enter value…"), "3");
    await user.click(screen.getByRole("button", { name: "Propose Cut" }));
    expect(props.onProposeDualCut).toHaveBeenCalledWith("w3", "3");
  });

  it("guess popup Cancel closes popup without calling onProposeDualCut", async () => {
    const user = userEvent.setup();
    const props = setup();
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Dual Cut" }));
    const bobContainer = getRackContainer("Bob");
    await user.click(within(bobContainer).getAllByRole("button")[0]);
    expect(screen.getByText(/Guess the value of Bob/i)).toBeInTheDocument();
    const popupText = screen.getByText(/Guess the value of Bob/i);
    await user.click(within(popupText.closest("div")!.parentElement!).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Guess the value of Bob/i)).not.toBeInTheDocument();
    expect(props.onProposeDualCut).not.toHaveBeenCalled();
  });

  // --- Pending Dual Cut (server broadcast) ---

  it("shows waiting indicator to proposer when dual_cut_proposed", () => {
    const props = setup({
      pendingDualCut: {
        type: "dual_cut_proposed" as const,
        proposingPlayerId: "p1",
        targetPlayerId: "p2",
        targetWireId: "w3",
        targetWireRackPosition: 1,
        guessedValue: "3",
      },
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText(/Waiting for Bob to respond/i)).toBeInTheDocument();
  });

  it("shows Yes/No popup to target player when dual_cut_proposed", async () => {
    const user = userEvent.setup();
    const props = setup({
      localPlayerId: "p2",
      pendingDualCut: {
        type: "dual_cut_proposed" as const,
        proposingPlayerId: "p1",
        targetPlayerId: "p2",
        targetWireId: "w3",
        targetWireRackPosition: 1,
        guessedValue: "3",
      },
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText(/Alice guesses your wire #1 has value/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(props.onRespondDualCut).toHaveBeenCalledWith(true);
  });

  it("No button sends respond_dual_cut with accepted=false", async () => {
    const user = userEvent.setup();
    const props = setup({
      localPlayerId: "p2",
      pendingDualCut: {
        type: "dual_cut_proposed" as const,
        proposingPlayerId: "p1",
        targetPlayerId: "p2",
        targetWireId: "w3",
        targetWireRackPosition: 1,
        guessedValue: "3",
      },
    });
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(props.onRespondDualCut).toHaveBeenCalledWith(false);
  });

  it("shows pick-own-wire prompt to proposer when dual_cut_correct", async () => {
    const user = userEvent.setup();
    const props = setup({
      pendingDualCut: {
        type: "dual_cut_proposed" as const,
        proposingPlayerId: "p1",
        targetPlayerId: "p2",
        targetWireId: "w3",
        targetWireRackPosition: 1,
        guessedValue: "3",
      },
      pendingDualCutCorrect: {
        type: "dual_cut_correct" as const,
        targetWireId: "w3",
        targetWireRackPosition: 1,
        targetWireColor: "blue" as const,
      },
      // local wires need a value to be selectable
      wires: [
        makeWire({ id: "w1", playerId: "p1", rackPosition: 1, value: "3" }),
        makeWire({ id: "w2", playerId: "p1", rackPosition: 2, value: "5" }),
        makeWire({ id: "w3", playerId: "p2", rackPosition: 1, value: null }),
        makeWire({ id: "w4", playerId: "p2", rackPosition: 2, value: null }),
      ],
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText(/Correct Guess!/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Wire #1" }));
    expect(props.onCompleteDualCut).toHaveBeenCalledWith("w1");
  });

  // --- Solo Cut UX ---

  it("entering solo_cut mode shows instruction text", async () => {
    const user = userEvent.setup();
    render(<GameBoard {...setup()} />);
    await user.click(screen.getByRole("button", { name: "Solo Cut" }));
    expect(
      screen.getByText(/Select 2 matching wires on your rack/i)
    ).toBeInTheDocument();
  });

  it("solo_cut: selecting 2 matching wires enables Confirm Solo Cut", async () => {
    const user = userEvent.setup();
    const props = setup();
    // Both local wires have value "4" (revealed, so selectable)
    props.wires = [
      makeWire({ id: "w1", playerId: "p1", rackPosition: 1, value: "4" }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 2, value: "4" }),
      makeWire({ id: "w3", playerId: "p2", rackPosition: 1, value: "3" }),
    ];
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Solo Cut" }));
    // Scope to local rack to avoid ValidationTracker slot ambiguity
    const youContainer = getRackContainer("You");
    const localWireButtons = within(youContainer).getAllByRole("button");
    await user.click(localWireButtons[0]); // w1
    await user.click(localWireButtons[1]); // w2
    expect(
      screen.getByRole("button", { name: "Confirm Solo Cut" })
    ).not.toBeDisabled();
  });

  it("solo_cut: selecting 2 mismatched wires shows error and disables confirm", async () => {
    const user = userEvent.setup();
    const props = setup();
    // Local wires have different values — mismatch
    props.wires = [
      makeWire({ id: "w1", playerId: "p1", rackPosition: 1, value: "3" }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 2, value: "5" }),
      makeWire({ id: "w3", playerId: "p2", rackPosition: 1, value: "2" }),
    ];
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Solo Cut" }));
    const youContainer = getRackContainer("You");
    const localWireButtons = within(youContainer).getAllByRole("button");
    await user.click(localWireButtons[0]); // w1, value "3"
    await user.click(localWireButtons[1]); // w2, value "5"
    expect(screen.getByText(/don't match/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm Solo Cut" })
    ).toBeDisabled();
  });

  it("solo_cut confirm calls onSoloCut with wire value", async () => {
    const user = userEvent.setup();
    const props = setup();
    props.wires = [
      makeWire({ id: "w1", playerId: "p1", rackPosition: 1, value: "4" }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 2, value: "4" }),
      makeWire({ id: "w3", playerId: "p2", rackPosition: 1, value: "3" }),
    ];
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Solo Cut" }));
    const youContainer = getRackContainer("You");
    const localWireButtons = within(youContainer).getAllByRole("button");
    await user.click(localWireButtons[0]);
    await user.click(localWireButtons[1]);
    await user.click(screen.getByRole("button", { name: "Confirm Solo Cut" }));
    expect(props.onSoloCut).toHaveBeenCalledWith("4");
  });

  it("shows info token badge with value on opponent wire", () => {
    const props = setup({
      infoTokens: [makeInfoToken({ wireId: "w3", value: "7" })],
    });
    render(<GameBoard {...props} />);
    // Scope to Bob's rack — badge shows token value "7" (wire itself shows "3", no collision)
    const bobContainer = getRackContainer("Bob");
    expect(within(bobContainer).getByText("7")).toBeInTheDocument();
  });

  it("shows info token badge on local player's own wire", () => {
    const props = setup({
      infoTokens: [makeInfoToken({ wireId: "w1", value: "7" })],
    });
    render(<GameBoard {...props} />);
    // w1 belongs to p1 (local), value=null — badge shows "7"
    const youContainer = getRackContainer("You");
    expect(within(youContainer).getByText("7")).toBeInTheDocument();
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
