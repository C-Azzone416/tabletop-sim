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
      onReady: vi.fn(),
      onStartGame: vi.fn(),
      onLeave: vi.fn(),
      highestUnlocked: 8,
    };
  };

  const allReady = () => {
    const captain = makePlayer({ id: "p1", name: "Alice", ready: true });
    const player2 = makePlayer({ id: "p2", name: "Bob", ready: true });
    return { players: [captain, player2] };
  };

  it("displays the join code", () => {
    render(<Lobby {...defaultProps()} />);
    expect(screen.getByText("XYZ789")).toBeInTheDocument();
  });

  // #451/#430 — the lobby's only exit. Sends leave_game (via onLeave), not
  // a plain navigation — leaving frees a seat, so GameClient's handler has
  // to tell the server before it routes away.
  describe("Leave affordance (#451/#430)", () => {
    it("renders a Leave affordance meeting the 44px touch target", () => {
      render(<Lobby {...defaultProps()} />);
      const leave = screen.getByRole("button", { name: /leave/i });
      expect(leave).toBeInTheDocument();
      expect(leave.className).toContain("min-h-11");
    });

    it("calls onLeave when clicked", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<Lobby {...props} />);
      await user.click(screen.getByRole("button", { name: /leave/i }));
      expect(props.onLeave).toHaveBeenCalledOnce();
    });
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

  describe("Ready button", () => {
    it("renders for a player who isn't ready yet, for both captain and non-captain", () => {
      const props = defaultProps();
      render(<Lobby {...props} />);
      expect(screen.getByRole("button", { name: "Ready" })).toBeInTheDocument();
    });

    it("calls onReady when clicked", async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<Lobby {...props} />);
      await user.click(screen.getByRole("button", { name: "Ready" }));
      expect(props.onReady).toHaveBeenCalledOnce();
    });

    it("is not rendered once the local player is already ready", () => {
      const props = { ...defaultProps(), ...allReady() };
      render(<Lobby {...props} />);
      expect(screen.queryByRole("button", { name: "Ready" })).not.toBeInTheDocument();
    });
  });

  describe("Start button (captain only)", () => {
    it("does not render before the captain has readied up themselves", () => {
      render(<Lobby {...defaultProps()} />);
      expect(screen.queryByRole("button", { name: /Start Mission/ })).not.toBeInTheDocument();
    });

    it("renders once the captain is ready, but stays disabled until everyone is ready", () => {
      const captain = makePlayer({ id: "p1", name: "Alice", ready: true });
      const player2 = makePlayer({ id: "p2", name: "Bob", ready: false });
      const props = { ...defaultProps(), players: [captain, player2] };
      render(<Lobby {...props} />);
      expect(screen.getByRole("button", { name: /Start Mission/ })).toBeDisabled();
    });

    it("is enabled once every player is ready", () => {
      const props = { ...defaultProps(), ...allReady() };
      render(<Lobby {...props} />);
      expect(screen.getByRole("button", { name: /Start Mission/ })).not.toBeDisabled();
    });

    it("calls onStartGame with the selected mission when clicked", async () => {
      const user = userEvent.setup();
      const props = { ...defaultProps(), ...allReady() };
      render(<Lobby {...props} />);
      await user.click(screen.getByRole("button", { name: /Start Mission/ }));
      expect(props.onStartGame).toHaveBeenCalledWith(1);
    });

    it("never renders for a non-captain, ready or not", () => {
      const props = { ...defaultProps(), ...allReady(), localPlayerId: "p2" };
      render(<Lobby {...props} />);
      expect(screen.queryByRole("button", { name: /Start Mission/ })).not.toBeInTheDocument();
    });
  });

  // #407 fixed canStart/the player-count display reading a hardcoded 4
  // instead of the room's own cap. #437 replaced the registry-lookup
  // mechanism #407 introduced with the room's persisted `maxPlayers` (a
  // host-chosen count, which may differ from the game's registry ceiling) —
  // these tests now drive that prop directly rather than via gameType.
  describe("player cap is the room's persisted maxPlayers (#437)", () => {
    const makeFivePlayers = (readyOverride: boolean) =>
      Array.from({ length: 5 }, (_, i) =>
        makePlayer({ id: `p${i + 1}`, name: `Player${i + 1}`, ready: readyOverride }),
      );

    it("shows the room's own persisted max, not the historical default", () => {
      const props = { ...defaultProps(), players: makeFivePlayers(false), maxPlayers: 5 };
      render(<Lobby {...props} />);
      expect(screen.getByText("Players (5/5)")).toBeInTheDocument();
    });

    it("does not disable Start for a 5th player when the room's max is 5", () => {
      const players = makeFivePlayers(true);
      const props = {
        ...defaultProps(),
        players,
        localPlayerId: players[0].id,
        captainId: players[0].id,
        maxPlayers: 5,
      };
      render(<Lobby {...props} />);
      expect(screen.getByRole("button", { name: /Start Mission/ })).not.toBeDisabled();
    });

    it("still caps at 4 when the room's persisted max is 4", () => {
      const players = makeFivePlayers(true);
      const props = {
        ...defaultProps(),
        players,
        localPlayerId: players[0].id,
        captainId: players[0].id,
        maxPlayers: 4,
      };
      render(<Lobby {...props} />);
      expect(screen.getByText("Players (5/4)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Start Mission/ })).toBeDisabled();
    });
  });

  describe("waiting indicators", () => {
    it("shows who isn't ready yet once the local player has readied up", () => {
      const captain = makePlayer({ id: "p1", name: "Alice", ready: true });
      const player2 = makePlayer({ id: "p2", name: "Bob", ready: false });
      const props = { ...defaultProps(), players: [captain, player2] };
      render(<Lobby {...props} />);
      expect(screen.getByText("Waiting for Bob to ready up...")).toBeInTheDocument();
    });

    it("tells a ready non-captain to wait on the host once everyone is ready", () => {
      const props = { ...defaultProps(), ...allReady(), localPlayerId: "p2" };
      render(<Lobby {...props} />);
      expect(
        screen.getByText("Waiting for the host to start the game..."),
      ).toBeInTheDocument();
    });

    it("shows nothing before the local player has readied up", () => {
      render(<Lobby {...defaultProps()} />);
      expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
    });
  });
});
