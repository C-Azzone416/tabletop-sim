import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionPanel } from "../app/components/ActionPanel";
import { makeWire, makePlayer, resetIds } from "./fixtures";

describe("ActionPanel", () => {
  beforeEach(() => resetIds());

  const setup = (overrides: Record<string, unknown> = {}) => {
    const localPlayer = makePlayer({ id: "p1", name: "Alice" });
    const onSetMode = vi.fn();
    const onCancel = vi.fn();
    const onSoloCutConfirm = vi.fn();
    const onDoubleDetector = vi.fn();
    const onRevealReds = vi.fn();

    const props = {
      isMyTurn: true,
      players: [localPlayer],
      wires: [],
      localPlayerId: "p1",
      doubleDetectorUsed: false,
      hasRedWires: false,
      mode: "idle" as const,
      onSetMode,
      onCancel,
      soloCutSelectedCount: 0,
      soloCutMatchStatus: "idle" as const,
      onSoloCutConfirm,
      onDoubleDetector,
      onRevealReds,
      ...overrides,
    };

    const utils = render(<ActionPanel {...props} />);
    return { ...utils, onSetMode, onCancel, onSoloCutConfirm, onDoubleDetector, onRevealReds };
  };

  it("renders nothing when it isn't the local player's turn", () => {
    const { container } = setup({ isMyTurn: false });
    expect(container).toBeEmptyDOMElement();
  });

  describe("idle mode — action selection", () => {
    it("shows Dual Cut and Solo Cut, but not Double Detector once used or Reveal Reds without red wires", () => {
      setup({ doubleDetectorUsed: true, hasRedWires: false });
      expect(screen.getByRole("button", { name: "Dual Cut" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Solo Cut" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Double Detector" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reveal Reds" })).not.toBeInTheDocument();
    });

    it("shows Double Detector when not yet used", () => {
      setup({ doubleDetectorUsed: false });
      expect(screen.getByRole("button", { name: "Double Detector" })).toBeInTheDocument();
    });

    it("shows Reveal Reds when the mission has red wires", () => {
      setup({ hasRedWires: true });
      expect(screen.getByRole("button", { name: "Reveal Reds" })).toBeInTheDocument();
    });

    it("calls onSetMode when Dual Cut is clicked", async () => {
      const user = userEvent.setup();
      const { onSetMode } = setup();
      await user.click(screen.getByRole("button", { name: "Dual Cut" }));
      expect(onSetMode).toHaveBeenCalledWith("dual_cut");
    });

    it("calls onSetMode when Solo Cut is clicked", async () => {
      const user = userEvent.setup();
      const { onSetMode } = setup();
      await user.click(screen.getByRole("button", { name: "Solo Cut" }));
      expect(onSetMode).toHaveBeenCalledWith("solo_cut");
    });

    it("calls onSetMode when Double Detector is clicked", async () => {
      const user = userEvent.setup();
      const { onSetMode } = setup({ doubleDetectorUsed: false });
      await user.click(screen.getByRole("button", { name: "Double Detector" }));
      expect(onSetMode).toHaveBeenCalledWith("double_detector");
    });

    it("calls onRevealReds directly (not onSetMode) when Reveal Reds is clicked", async () => {
      const user = userEvent.setup();
      const { onRevealReds, onSetMode } = setup({ hasRedWires: true });
      await user.click(screen.getByRole("button", { name: "Reveal Reds" }));
      expect(onRevealReds).toHaveBeenCalled();
      expect(onSetMode).not.toHaveBeenCalled();
    });
  });

  describe("dual_cut mode", () => {
    it("shows the guidance text and a Cancel button", async () => {
      const user = userEvent.setup();
      const { onCancel } = setup({ mode: "dual_cut" });
      expect(
        screen.getByText("Dual Cut — Click an opponent's wire to guess its value"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Click any opponent wire tile on the board above to open the guess popup."),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("solo_cut mode", () => {
    it("prompts for a first wire when nothing is selected, and disables Confirm", () => {
      setup({ mode: "solo_cut", soloCutSelectedCount: 0, soloCutMatchStatus: "idle" });
      expect(screen.getByText("Select a revealed wire from your rack.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm Solo Cut" })).toBeDisabled();
    });

    it("prompts for a second wire after one is selected", () => {
      setup({ mode: "solo_cut", soloCutSelectedCount: 1, soloCutMatchStatus: "idle" });
      expect(screen.getByText("Select one more matching wire.")).toBeInTheDocument();
    });

    it("shows a mismatch message and keeps Confirm disabled when wires don't match", () => {
      setup({ mode: "solo_cut", soloCutSelectedCount: 2, soloCutMatchStatus: "mismatch" });
      expect(screen.getByText("Selected wires don't match.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm Solo Cut" })).toBeDisabled();
    });

    it("shows a ready message and enables Confirm when wires match", async () => {
      const user = userEvent.setup();
      const { onSoloCutConfirm } = setup({
        mode: "solo_cut",
        soloCutSelectedCount: 2,
        soloCutMatchStatus: "valid",
      });
      expect(screen.getByText("Wires match — ready to cut!")).toBeInTheDocument();
      const confirmBtn = screen.getByRole("button", { name: "Confirm Solo Cut" });
      expect(confirmBtn).not.toBeDisabled();
      await user.click(confirmBtn);
      expect(onSoloCutConfirm).toHaveBeenCalled();
    });
  });

  describe("double_detector mode", () => {
    it("lists only the local player's own hidden wires, sorted by rack position", () => {
      const wires = [
        makeWire({ id: "w1", playerId: "p1", rackPosition: 1, status: "hidden" }),
        makeWire({ id: "w2", playerId: "p1", rackPosition: 2, status: "cut" }), // not hidden — excluded
        makeWire({ id: "w3", playerId: "p2", rackPosition: 1, status: "hidden" }), // other player — excluded
      ];
      setup({ mode: "double_detector", wires });
      expect(screen.getByRole("button", { name: "Wire #1" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Wire #2" })).not.toBeInTheDocument();
    });

    it("selects a first and second wire, then submits and resets on confirm", async () => {
      const user = userEvent.setup();
      const wires = [
        makeWire({ id: "w1", playerId: "p1", rackPosition: 1, status: "hidden" }),
        makeWire({ id: "w2", playerId: "p1", rackPosition: 2, status: "hidden" }),
      ];
      const { onDoubleDetector, onCancel } = setup({ mode: "double_detector", wires });

      const checkBtn = screen.getByRole("button", { name: "Check Wires" });
      expect(checkBtn).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Wire #1" }));
      expect(checkBtn).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Wire #2" }));
      expect(checkBtn).not.toBeDisabled();

      await user.click(checkBtn);
      expect(onDoubleDetector).toHaveBeenCalledWith("w1", "w2");
      expect(onCancel).toHaveBeenCalled();
    });

    it("deselects a wire when clicked again", async () => {
      const user = userEvent.setup();
      const wires = [makeWire({ id: "w1", playerId: "p1", rackPosition: 1, status: "hidden" })];
      setup({ mode: "double_detector", wires });

      const wireBtn = screen.getByRole("button", { name: "Wire #1" });
      await user.click(wireBtn);
      await user.click(wireBtn);

      // Deselected — Check Wires stays disabled since only one slot was ever filled
      expect(screen.getByRole("button", { name: "Check Wires" })).toBeDisabled();
    });

    it("does not submit when only one wire is selected", async () => {
      const user = userEvent.setup();
      const wires = [makeWire({ id: "w1", playerId: "p1", rackPosition: 1, status: "hidden" })];
      const { onDoubleDetector } = setup({ mode: "double_detector", wires });

      await user.click(screen.getByRole("button", { name: "Wire #1" }));
      expect(screen.getByRole("button", { name: "Check Wires" })).toBeDisabled();
      expect(onDoubleDetector).not.toHaveBeenCalled();
    });

    it("Cancel clears in-progress double detector selection", async () => {
      const user = userEvent.setup();
      const wires = [makeWire({ id: "w1", playerId: "p1", rackPosition: 1, status: "hidden" })];
      const { onCancel } = setup({ mode: "double_detector", wires });

      await user.click(screen.getByRole("button", { name: "Wire #1" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalled();
    });
  });
});
