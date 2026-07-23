import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PlayerRack } from "../app/components/PlayerRack";
import { makeWire, resetIds } from "./fixtures";

describe("PlayerRack (#159 item 2)", () => {
  it("distinguishes the local player's rack with a blue-tinted background", () => {
    resetIds();
    const wires = [makeWire({ status: "hidden", value: "3" })];
    const { getByTestId } = render(
      <PlayerRack wires={wires} isLocal infoTokens={[]} />,
    );
    expect(getByTestId("player-rack").className).toContain("bg-blue-50");
  });

  it("does not tint an opponent's rack", () => {
    resetIds();
    const wires = [makeWire({ status: "hidden", value: null })];
    const { getByTestId } = render(
      <PlayerRack wires={wires} isLocal={false} infoTokens={[]} />,
    );
    expect(getByTestId("player-rack").className).not.toContain("bg-blue-50");
  });
});
