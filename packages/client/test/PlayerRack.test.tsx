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

describe("PlayerRack — C6 dense private state (#244)", () => {
  // jsdom does not lay out, so this asserts the mechanism, not the pixels.
  // Measured in a real engine at 360px with 12 wires: without `flex-wrap` the
  // tiles shrink to 23px (the 44x44 floor, halved) rather than overflowing;
  // with it, 2 rows and tiles back at 48px. The pixel check belongs in E2E.
  it("wraps rather than squeezing tiles below the tap-target floor", () => {
    resetIds();
    const wires = Array.from({ length: 12 }, (_, i) =>
      makeWire({ status: "hidden", value: String(i + 1) }),
    );
    const { getByTestId } = render(
      <PlayerRack wires={wires} isLocal infoTokens={[]} />,
    );
    expect(getByTestId("player-rack").className).toContain("flex-wrap");
  });

  it("wraps opponent racks too — density is not a local-only concern", () => {
    resetIds();
    const wires = Array.from({ length: 12 }, () =>
      makeWire({ status: "hidden", value: null }),
    );
    const { getByTestId } = render(
      <PlayerRack wires={wires} isLocal={false} infoTokens={[]} />,
    );
    expect(getByTestId("player-rack").className).toContain("flex-wrap");
  });
});
