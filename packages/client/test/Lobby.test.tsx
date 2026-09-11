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

  // #407: canStart and the player-count display hardcoded Wire Game's cap of
  // 4 instead of reading the room's own game from the registry. Flip's max is
  // 5, so a 5th player joined fine (server-side gate is registry-aware) but
  // Start then stayed disabled forever with no explanation. Flip is used here
  // specifically because its max (5) is not 4 — a max-4 game type can't catch
  // this class of bug, which is exactly how it shipped.
  describe("player cap by game type (#407)", () => {
    const makeFivePlayers = (readyOverride: boolean) =>
      Array.from({ length: 5 }, (_, i) =>
        makePlayer({ id: `p${i + 1}`, name: `Player${i + 1}`, ready: readyOverride }),
      );

    it("shows the room's own max, not Wire Game's, for a non-Wire game type", () => {
      const props = { ...defaultProps(), players: makeFivePlayers(false), gameType: "flip" };
      render(<Lobby {...props} />);
      expect(screen.getByText("Players (5/5)")).toBeInTheDocument();
    });

    it("does not disable Start for a 5th player on a game whose max is 5", () => {
      const players = makeFivePlayers(true);
      const props = {
        ...defaultProps(),
        players,
        localPlayerId: players[0].id,
        captainId: players[0].id,
        gameType: "flip",
      };
      render(<Lobby {...props} />);
      expect(screen.getByRole("button", { name: "Start Game" })).not.toBeDisabled();
    });

    it("still caps Wire Game at 4 when gameType is explicitly wire-game", () => {
      const players = makeFivePlayers(true);
      const props = {
        ...defaultProps(),
        players,
        localPlayerId: players[0].id,
        captainId: players[0].id,
        gameType: "wire-game",
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
