import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PlayerRack } from "../app/components/PlayerRack";
import { makeWire, resetIds } from "./fixtures";

describe("PlayerRack (#159 item 2)", () => {
  // "Yellow means yours" (DESIGN.md) — the private surface is the only one
  // painted --game-rack, so it must never share styling with any other view.
  it("distinguishes the local player's rack with the --game-rack background", () => {
    resetIds();
    const wires = [makeWire({ status: "hidden", value: "3" })];
    const { getByTestId } = render(
      <PlayerRack wires={wires} isLocal infoTokens={[]} />,
    );
    expect(getByTestId("player-rack").className).toContain("bg-game-rack");
  });

  it("does not tint an opponent's rack", () => {
    resetIds();
    const wires = [makeWire({ status: "hidden", value: null })];
    const { getByTestId } = render(
      <PlayerRack wires={wires} isLocal={false} infoTokens={[]} />,
    );
    expect(getByTestId("player-rack").className).not.toContain("bg-game-rack");
  });
});
