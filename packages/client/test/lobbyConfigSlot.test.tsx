import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lobby } from "../app/components/Lobby";
import { resolveLobbyConfigSlot } from "../app/components/lobbyConfig/registry";
import {
  WireGameConfigPanel,
  wireGameConfigSlot,
  type WireGameConfig,
} from "../app/components/lobbyConfig/wireGameSlot";
import { readRoomGameType } from "../app/lib/roomGameType";
import { makePlayer, resetIds } from "./fixtures";

const context = { highestUnlocked: 8 };

describe("lobby config slot (#319)", () => {
  beforeEach(() => resetIds());

  describe("resolveLobbyConfigSlot", () => {
    it("resolves wire-game to the Wire Game slot", () => {
      expect(resolveLobbyConfigSlot("wire-game")).toBe(wireGameConfigSlot);
    });

    it("degrades to the Wire Game slot when room state carries no gameType yet", () => {
      // Integration point: gameType only reaches room state with #313/#325.
      expect(resolveLobbyConfigSlot(null)).toBe(wireGameConfigSlot);
    });

    it("does NOT fall back to Wire Game for a registered-but-unimplemented game", () => {
      // Masking a missing panel with Wire Game's would show a mission picker
      // for a Spades room.
      const slot = resolveLobbyConfigSlot("spades");
      expect(slot).not.toBe(wireGameConfigSlot);
      expect(slot.startLabel({})).toBe("Start Game");
    });

    it("does NOT fall back to Wire Game for an unknown game id", () => {
      expect(resolveLobbyConfigSlot("checkers")).not.toBe(wireGameConfigSlot);
    });
  });

  describe("Wire Game slot", () => {
    it("defaults to mission 1, the lobby's pre-refactor initial selection", () => {
      expect(wireGameConfigSlot.createDefaultConfig(context)).toEqual({ mission: 1 });
    });

    it("keeps the existing start-button label", () => {
      expect(wireGameConfigSlot.startLabel({ mission: 3 })).toBe("Start Mission 3");
    });

    it("maps its config onto the existing start_game mission number", () => {
      expect(wireGameConfigSlot.toStartArg({ mission: 5 })).toBe(5);
    });

    it("titles the section exactly as the lobby did before", () => {
      expect(wireGameConfigSlot.title).toBe("Select Mission");
    });
  });

  describe("WireGameConfigPanel", () => {
    const renderPanel = (canEdit: boolean, onChange = vi.fn()) => {
      const config: WireGameConfig = { mission: 1 };
      render(
        <WireGameConfigPanel
          config={config}
          onChange={onChange}
          canEdit={canEdit}
          context={context}
        />,
      );
      return onChange;
    };

    it("reports the picked mission to the lobby", async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(true);
      await user.click(screen.getByRole("button", { name: /Mission 3/ }));
      expect(onChange).toHaveBeenCalledWith({ mission: 3 });
    });

    it("renders read-only when canEdit is false", async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(false);
      const missionButton = screen.getByRole("button", { name: /Mission 3/ });
      expect(missionButton).toBeDisabled();
      await user.click(missionButton);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("readRoomGameType", () => {
    it("returns null when room state has no gameType (develop today)", () => {
      expect(readRoomGameType(undefined)).toBeNull();
      expect(readRoomGameType(null)).toBeNull();
      // @ts-expect-error — partial Game stand-in; gameType lands with #325
      expect(readRoomGameType({ id: "g1" })).toBeNull();
    });

    it("reads the gameType once room state carries it", () => {
      // @ts-expect-error — partial Game stand-in; gameType lands with #325
      expect(readRoomGameType({ id: "g1", gameType: "wire-game" })).toBe("wire-game");
    });

    it("treats a non-string or empty gameType as absent rather than valid", () => {
      // @ts-expect-error — deliberately malformed room state
      expect(readRoomGameType({ id: "g1", gameType: "" })).toBeNull();
      // @ts-expect-error — deliberately malformed room state
      expect(readRoomGameType({ id: "g1", gameType: 7 })).toBeNull();
    });
  });

  describe("Lobby renders the slot for the room's game", () => {
    const props = (overrides: Record<string, unknown> = {}) => ({
      joinCode: "XYZ789",
      players: [
        makePlayer({ id: "p1", name: "Alice", ready: true }),
        makePlayer({ id: "p2", name: "Bob", ready: true }),
      ],
      localPlayerId: "p1",
      captainId: "p1",
      onReady: vi.fn(),
      onStartGame: vi.fn(),
      highestUnlocked: 8,
      ...overrides,
    });

    it("shows Wire Game's mission picker for a wire-game room", () => {
      render(<Lobby {...props({ gameType: "wire-game" })} />);
      expect(screen.getByText("Select Mission")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Start Mission 1/ })).toBeInTheDocument();
    });

    it("shows Wire Game's mission picker when gameType is absent", () => {
      render(<Lobby {...props()} />);
      expect(screen.getByText("Select Mission")).toBeInTheDocument();
    });

    it("passes the captain's pick through the slot to onStartGame unchanged", async () => {
      const user = userEvent.setup();
      const p = props({ gameType: "wire-game" });
      render(<Lobby {...p} />);
      await user.click(screen.getByRole("button", { name: /Mission 4/ }));
      expect(screen.getByRole("button", { name: /Start Mission 4/ })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Start Mission 4/ }));
      expect(p.onStartGame).toHaveBeenCalledWith(4);
    });

    it("renders no config panel at all for a non-captain, as before #319", () => {
      render(<Lobby {...props({ gameType: "wire-game", localPlayerId: "p2" })} />);
      expect(screen.queryByText("Select Mission")).not.toBeInTheDocument();
    });

    it("renders a different game's slot without any change to Lobby.tsx", () => {
      // The acceptance criterion for this story: the panel is chosen by data,
      // not by a branch inside the lobby.
      render(<Lobby {...props({ gameType: "spades" })} />);
      expect(screen.queryByText("Select Mission")).not.toBeInTheDocument();
      expect(screen.getByText("Game Options")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
    });
  });
});
