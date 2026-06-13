import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      pendingDuoCut: null,
      onProposeDuoCut: vi.fn(),
      onRespondDuoCut: vi.fn(),
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

  // Helper: get the rack container div for a given player label
  const getRackContainer = (label: string) => {
    const span = screen.getByText(label);
    // label span → flex div → outer player div
    return span.closest("div")!.parentElement!;
  };

  // --- Duo Cut UX ---

  it("entering duo_cut mode shows instruction text", async () => {
    const user = userEvent.setup();
    render(<GameBoard {...setup()} />);
    await user.click(screen.getByRole("button", { name: "Duo Cut" }));
    expect(
      screen.getByText(/Click an opponent's wire on the board/i)
    ).toBeInTheDocument();
  });

  it("clicking opponent wire in duo_cut mode opens modal", async () => {
    const user = userEvent.setup();
    const props = setup();
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Duo Cut" }));
    // Scope to Bob's rack to avoid ambiguity with ValidationTracker slots
    const bobContainer = getRackContainer("Bob");
    const bobWireButtons = within(bobContainer).getAllByRole("button");
    await user.click(bobWireButtons[0]);
    expect(screen.getByText(/Cut Bob's wire #1/i)).toBeInTheDocument();
  });

  it("duo_cut modal confirm calls onProposeDuoCut with wire id", async () => {
    const user = userEvent.setup();
    const props = setup();
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Duo Cut" }));
    const bobContainer = getRackContainer("Bob");
    const bobWireButtons = within(bobContainer).getAllByRole("button");
    await user.click(bobWireButtons[0]); // w3
    await user.click(screen.getByRole("button", { name: "Confirm Cut" }));
    expect(props.onProposeDuoCut).toHaveBeenCalledWith("w3");
  });

  it("duo_cut modal cancel closes modal without calling onProposeDuoCut", async () => {
    const user = userEvent.setup();
    const props = setup();
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Duo Cut" }));
    const bobContainer = getRackContainer("Bob");
    await user.click(within(bobContainer).getAllByRole("button")[0]);
    const modalText = screen.getByText(/Cut Bob/i);
    expect(modalText).toBeInTheDocument();
    // Scope Cancel click to the modal panel to avoid ActionPanel's Cancel button
    const modalPanel = modalText.closest("div")!;
    await user.click(within(modalPanel).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Cut Bob/i)).not.toBeInTheDocument();
    expect(props.onProposeDuoCut).not.toHaveBeenCalled();
  });

  // --- Pending Duo Cut (server broadcast) ---

  it("shows waiting indicator to proposer when duo_cut_proposed", () => {
    const props = setup({
      pendingDuoCut: {
        type: "duo_cut_proposed" as const,
        proposingPlayerId: "p1",
        targetPlayerId: "p2",
        targetWireId: "w3",
        targetWireRackPosition: 0,
      },
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText(/Waiting for Bob to respond/i)).toBeInTheDocument();
  });

  it("shows confirm/reject popup to target player when duo_cut_proposed", async () => {
    const user = userEvent.setup();
    const props = setup({
      // p2 is the local player (target)
      localPlayerId: "p2",
      pendingDuoCut: {
        type: "duo_cut_proposed" as const,
        proposingPlayerId: "p1",
        targetPlayerId: "p2",
        targetWireId: "w3",
        targetWireRackPosition: 0,
      },
    });
    render(<GameBoard {...props} />);
    expect(screen.getByText(/Alice wants to cut your wire #1/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(props.onRespondDuoCut).toHaveBeenCalledWith(true);
  });

  it("reject button sends respond_duo_cut with accepted=false", async () => {
    const user = userEvent.setup();
    const props = setup({
      localPlayerId: "p2",
      pendingDuoCut: {
        type: "duo_cut_proposed" as const,
        proposingPlayerId: "p1",
        targetPlayerId: "p2",
        targetWireId: "w3",
        targetWireRackPosition: 0,
      },
    });
    render(<GameBoard {...props} />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(props.onRespondDuoCut).toHaveBeenCalledWith(false);
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
      makeWire({ id: "w1", playerId: "p1", rackPosition: 0, value: "4" }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 1, value: "4" }),
      makeWire({ id: "w3", playerId: "p2", rackPosition: 0, value: "3" }),
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
      makeWire({ id: "w1", playerId: "p1", rackPosition: 0, value: "3" }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 1, value: "5" }),
      makeWire({ id: "w3", playerId: "p2", rackPosition: 0, value: "2" }),
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
      makeWire({ id: "w1", playerId: "p1", rackPosition: 0, value: "4" }),
      makeWire({ id: "w2", playerId: "p1", rackPosition: 1, value: "4" }),
      makeWire({ id: "w3", playerId: "p2", rackPosition: 0, value: "3" }),
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
