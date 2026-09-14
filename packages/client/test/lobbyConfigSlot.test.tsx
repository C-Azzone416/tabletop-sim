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
    // #333 — this is the actual proof the registry lookup works: "wire-game"
    // is a REGISTERED id, so this exercises LOBBY_CONFIG_SLOTS.find, not the
    // neutral fallback. Contrast with the "unimplemented"/"unknown" tests
    // below, which never reach the lookup's positive branch at all — and
    // with the Lobby-level "renders a different game's slot" test further
    // down, which (per its own updated comment) is a fallback test, not a
    // lookup test.
    it("resolves wire-game to the Wire Game slot via the registry lookup", () => {
      expect(resolveLobbyConfigSlot("wire-game")).toBe(wireGameConfigSlot);
    });

    // #333 — null can no longer mean "this room has no game type" (#313/
    // #314/#312 made gameType required, NOT NULL with a CHECK). It now means
    // only "room state has not loaded yet," which the caller must render as
    // an explicit absence rather than guess at a game — degrading to Wire
    // Game here was the exact "dead fallback that silently picks a specific
    // game" problem #333 exists to close.
    it("returns null when room state has not loaded yet, rather than guessing a game", () => {
      expect(resolveLobbyConfigSlot(null)).toBeNull();
    });

    it("does NOT fall back to Wire Game for a registered-but-unimplemented game", () => {
      // Masking a missing panel with Wire Game's would show a mission picker
      // for a Spades room.
      const slot = resolveLobbyConfigSlot("spades");
      expect(slot).not.toBe(wireGameConfigSlot);
      expect(slot?.startLabel({})).toBe("Start Game");
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
    // #333 — null now means only "room state has not loaded yet" (`game`
    // itself is null/undefined), never "this room has no game type": #313/
    // #314/#312 made `gameType` required, NOT NULL with a CHECK constraint,
    // rejected server-side if missing. A malformed-gameType case (empty
    // string, wrong type) is no longer reachable through real room state and
    // was removed rather than kept as permanent defense against something
    // the schema itself now prevents.
    it("returns null when room state has not loaded yet", () => {
      expect(readRoomGameType(undefined)).toBeNull();
      expect(readRoomGameType(null)).toBeNull();
    });

    it("reads the gameType once room state has loaded", () => {
      // @ts-expect-error — partial Game stand-in
      expect(readRoomGameType({ id: "g1", gameType: "wire-game" })).toBe("wire-game");
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
      onLeave: vi.fn(),
      onChangePlayerCount: vi.fn(),
      highestUnlocked: 8,
      ...overrides,
    });

    it("shows Wire Game's mission picker for a wire-game room", () => {
      render(<Lobby {...props({ gameType: "wire-game" })} />);
      expect(screen.getByText("Select Mission")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Start Mission 1/ })).toBeInTheDocument();
    });

    // #333 — gameType absent now means "room state has not loaded yet," not
    // "assume Wire Game." Renders nothing rather than guessing.
    it("renders no config panel at all while gameType is absent (room not loaded yet)", () => {
      render(<Lobby {...props()} />);
      expect(screen.queryByText("Select Mission")).not.toBeInTheDocument();
      expect(screen.queryByText("Game Options")).not.toBeInTheDocument();
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

    // #333 review — this exercises the NEUTRAL FALLBACK path (unimplemented
    // "spades" is not in LOBBY_CONFIG_SLOTS, so it never reaches the
    // registry's positive lookup branch at all) rather than proving the
    // registry lookup itself works — it would still pass even if
    // LOBBY_CONFIG_SLOTS.find were completely broken, since "spades" was
    // never going to be found either way. It IS still real coverage — Lobby
    // rendering a different panel without any branch of its own for an
    // unregistered id — just not the lookup proof its old comment claimed.
    // The registry-lookup proof is `resolveLobbyConfigSlot`'s own
    // "...via the registry lookup" test above, and "shows Wire Game's
    // mission picker for a wire-game room" below is its Lobby-level
    // equivalent (wire-game IS registered).
    it("renders the neutral fallback panel for an unregistered game id, without any change to Lobby.tsx", () => {
      render(<Lobby {...props({ gameType: "spades" })} />);
      expect(screen.queryByText("Select Mission")).not.toBeInTheDocument();
      expect(screen.getByText("Game Options")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
    });

    // #333 — the render-phase config reset (Lobby.tsx: resets `config` when
    // `slot.gameId` changes) had zero coverage before this PR — the only
    // untested branch in the file, and the block both #328's PR body and the
    // #319 ruling flagged as most fragile. Exercised here via the exact
    // transition that fires it in practice: gameType arriving after the
    // room hasn't loaded yet (slot null -> a real slot), which must replace
    // the "no config yet" placeholder with that slot's real default rather
    // than keeping stale/absent config under the new panel.
    it("resets to the new slot's default config when gameType arrives after the room had not loaded yet", () => {
      const p = props();
      const { rerender } = render(<Lobby {...p} />);
      expect(screen.queryByText("Select Mission")).not.toBeInTheDocument();

      rerender(<Lobby {...p} gameType="wire-game" />);

      // Mission 1 is wireGameConfigSlot's createDefaultConfig, not leftover
      // state from before the slot resolved — proving the reset actually ran
      // rather than the panel merely appearing.
      expect(screen.getByText("Select Mission")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Start Mission 1/ })).toBeInTheDocument();
    });

    // #333 — the same reset must also fire captain-side when the room's
    // game type changes from one registered game to another mid-session
    // (not just from the null/not-loaded state), so a stale config value
    // never survives under the wrong panel.
    it("resets config when the room's slot changes from one registered game to another", () => {
      const p = props({ gameType: "wire-game" });
      const { rerender } = render(<Lobby {...p} />);
      expect(screen.getByText("Select Mission")).toBeInTheDocument();

      rerender(<Lobby {...p} gameType="spades" />);

      expect(screen.queryByText("Select Mission")).not.toBeInTheDocument();
      expect(screen.getByText("Game Options")).toBeInTheDocument();
    });
  });
});
