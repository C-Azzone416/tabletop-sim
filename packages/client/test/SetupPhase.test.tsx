import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupPhase } from "../app/components/SetupPhase";
import type { InfoToken } from "@tabletop/shared";
import { makeGame, makePlayer, makeWire, makeInfoToken, resetIds } from "./fixtures";

describe("SetupPhase", () => {
  beforeEach(() => resetIds());

  const setup = (overrides: { currentTurnPlayerId?: string; localPlayerId?: string } = {}) => {
    const game = makeGame({
      id: "g1",
      status: "setup",
      captainId: "p1",
      currentTurnPlayerId: overrides.currentTurnPlayerId ?? "p1",
    });
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

    return {
      game,
      players: [localPlayer, otherPlayer],
      wires: [...localWires, ...otherWires],
      infoTokens: [] as InfoToken[],
      localPlayerId: overrides.localPlayerId ?? "p1",
      onPlaceInfoToken,
    };
  };

  it("renders the placement heading", () => {
    render(<SetupPhase {...setup()} />);
    expect(screen.getByText("Place Your Opening Info Token")).toBeInTheDocument();
  });

  it("labels local player rack", () => {
    render(<SetupPhase {...setup()} />);
    expect(screen.getByText("Your Rack")).toBeInTheDocument();
  });

  it("shows other player name", () => {
    render(<SetupPhase {...setup()} />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("board-first: renders every player's rack simultaneously, not just the active placer's", () => {
    render(<SetupPhase {...setup()} />);
    expect(screen.getAllByTestId("player-rack")).toHaveLength(2);
  });

  describe("turn indicator", () => {
    it("tells the active placer it's their turn", () => {
      render(<SetupPhase {...setup({ currentTurnPlayerId: "p1", localPlayerId: "p1" })} />);
      expect(
        screen.getByText("Your turn — place your opening info token"),
      ).toBeInTheDocument();
    });

    it("tells a non-active player who they're waiting on", () => {
      render(<SetupPhase {...setup({ currentTurnPlayerId: "p2", localPlayerId: "p1" })} />);
      expect(screen.getByText("Waiting for Bob to place their token...")).toBeInTheDocument();
    });
  });

  describe("placement — active placer", () => {
    it("shows the placement prompt and allows selecting a local blue wire", async () => {
      const user = userEvent.setup();
      const props = setup({ currentTurnPlayerId: "p1", localPlayerId: "p1" });
      render(<SetupPhase {...props} />);
      expect(
        screen.getByText(/Select one of your blue wires to place your opening info token/i),
      ).toBeInTheDocument();

      const yourRackHeading = screen.getByText("Your Rack");
      const yourRackSection = yourRackHeading.closest("div")!;
      const localWireButton = within(yourRackSection).getAllByRole("button")[0];
      await user.click(localWireButton);
      expect(props.onPlaceInfoToken).toHaveBeenCalledWith("w1");
    });

    it("shows confirmation text once the token is placed", () => {
      const props = setup({ currentTurnPlayerId: "p1", localPlayerId: "p1" });
      props.infoTokens = [makeInfoToken({ wireId: "w1" })];
      render(<SetupPhase {...props} />);
      expect(screen.getByText("Opening info token placed.")).toBeInTheDocument();
    });

    it("local wire is not clickable once already placed", async () => {
      const user = userEvent.setup();
      const props = setup({ currentTurnPlayerId: "p1", localPlayerId: "p1" });
      props.infoTokens = [makeInfoToken({ wireId: "w1" })];
      render(<SetupPhase {...props} />);
      const yourRackHeading = screen.getByText("Your Rack");
      const yourRackSection = yourRackHeading.closest("div")!;
      const localWireButton = within(yourRackSection).getAllByRole("button")[0];
      await user.click(localWireButton);
      expect(props.onPlaceInfoToken).not.toHaveBeenCalled();
    });
  });

  describe("placement — not the active placer (non-captain render path)", () => {
    it("shows a waiting-for-turn prompt instead of the placement prompt", () => {
      render(<SetupPhase {...setup({ currentTurnPlayerId: "p2", localPlayerId: "p1" })} />);
      expect(
        screen.getByText("Waiting for your turn to place your opening info token."),
      ).toBeInTheDocument();
    });

    it("does not allow placing a token out of turn", async () => {
      const user = userEvent.setup();
      const props = setup({ currentTurnPlayerId: "p2", localPlayerId: "p1" });
      render(<SetupPhase {...props} />);
      const yourRackHeading = screen.getByText("Your Rack");
      const yourRackSection = yourRackHeading.closest("div")!;
      const localWireButton = within(yourRackSection).getAllByRole("button")[0];
      await user.click(localWireButton);
      expect(props.onPlaceInfoToken).not.toHaveBeenCalled();
    });

    it("renders correctly from a non-captain player's own perspective", () => {
      // localPlayerId "p2" — captainId on the fixture game is "p1" — this is
      // exactly the render path that hid the original setup-completion bug.
      render(<SetupPhase {...setup({ currentTurnPlayerId: "p1", localPlayerId: "p2" })} />);
      expect(screen.getByText("Your Rack")).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(
        screen.getByText("Waiting for Alice to place their token..."),
      ).toBeInTheDocument();
    });
  });
});
