import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlipGameRoot } from "../../app/components/flip/FlipGameRoot";
import type { FlipTableView } from "@tabletop/shared";

function makeFlip(overrides: Partial<FlipTableView> = {}): FlipTableView {
  return {
    phase: "round-in-progress",
    roundNumber: 1,
    dealerId: "p1",
    turnPlayerId: "p1",
    players: [
      { id: "p1", name: "Alice", status: "active", hand: [], totalScore: 0, uniqueNumberCount: 0, rounds: [] },
      { id: "p2", name: "Bea", status: "active", hand: [], totalScore: 0, uniqueNumberCount: 0, rounds: [] },
    ],
    shoeRemaining: 20,
    discardCount: 0,
    pendingAction: null,
    flip3Stack: [],
    lastRoundResult: null,
    winnerId: null,
    resolutionLog: [],
    turnDeadline: null,
    ...overrides,
  };
}

const noop = () => {};

describe("FlipGameRoot — bust notice (#422)", () => {
  it("shows a bust notice for an ordinary hit bust, with no pendingAction involved", () => {
    const flip = makeFlip({
      resolutionLog: [
        { targetId: "p2", card: { id: "c9", kind: "number", value: 6 }, effect: "number-busted", context: "hit" },
      ],
    });
    render(
      <FlipGameRoot
        flip={flip}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );
    expect(screen.getByTestId("bust-notice")).toHaveTextContent("Bea busted!");
    expect(screen.getByTestId("card-c9")).toBeInTheDocument();
  });

  it("dismissing the notice removes it and does not bring it back on an unrelated re-render", async () => {
    const user = userEvent.setup();
    const flip = makeFlip({
      resolutionLog: [
        { targetId: "p2", card: { id: "c9", kind: "number", value: 6 }, effect: "number-busted", context: "hit" },
      ],
    });
    const { rerender } = render(
      <FlipGameRoot
        flip={flip}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.queryByTestId("bust-notice")).not.toBeInTheDocument();

    // Same resolutionLog broadcast again (e.g. an unrelated state refresh) — must not resurrect the notice.
    rerender(
      <FlipGameRoot
        flip={{ ...flip, shoeRemaining: flip.shoeRemaining - 1 }}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );
    expect(screen.queryByTestId("bust-notice")).not.toBeInTheDocument();
  });

  it("queues a second bust from a fresh resolutionLog rather than replacing the first", async () => {
    const user = userEvent.setup();
    const flip = makeFlip({
      resolutionLog: [
        { targetId: "p2", card: { id: "c9", kind: "number", value: 6 }, effect: "number-busted", context: "hit" },
      ],
    });
    const { rerender } = render(
      <FlipGameRoot
        flip={flip}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );

    // A second, distinct action busts p1 before the first notice is dismissed.
    rerender(
      <FlipGameRoot
        flip={{
          ...flip,
          turnPlayerId: "p2",
          resolutionLog: [
            { targetId: "p1", card: { id: "c10", kind: "number", value: 2 }, effect: "number-busted", context: "hit" },
          ],
        }}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );

    expect(screen.getByTestId("bust-notice")).toHaveTextContent("Bea busted!");
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /got it/i }));
    expect(screen.getByTestId("bust-notice")).toHaveTextContent("You busted!");
    expect(screen.getByTestId("card-c10")).toBeInTheDocument();
  });

  // #497 AC — a bust during a Flip 3/Freeze pause still renders BustNotice,
  // without double-narrating alongside PendingActionPicker. Before this fix,
  // PendingActionPicker's own narration slot (describeLastEvent) ALSO said
  // "<name> busted — 0 for the round..." for the exact same event, so both
  // the modal notice and the pause's inline text showed the bust at once.
  it("shows the bust notice during a Flip3 pause without PendingActionPicker also narrating it", () => {
    const flip = makeFlip({
      pendingAction: { kind: "flip3", flipperId: "p1", eligibleTargetIds: ["p1", "p2"] },
      resolutionLog: [
        { targetId: "p2", card: { id: "c9", kind: "number", value: 6 }, effect: "number-busted", context: "flip3" },
      ],
    });
    render(
      <FlipGameRoot
        flip={flip}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );
    expect(screen.getByTestId("bust-notice")).toHaveTextContent("Bea busted!");
    expect(screen.getByTestId("flip-pending-action-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("flip-pending-action-narration")).not.toBeInTheDocument();
  });

  it("shows nothing when resolutionLog has no bust events", () => {
    const flip = makeFlip({
      resolutionLog: [
        { targetId: "p1", card: { id: "c1", kind: "number", value: 4 }, effect: "number-added", context: "hit" },
      ],
    });
    render(
      <FlipGameRoot
        flip={flip}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );
    expect(screen.queryByTestId("bust-notice")).not.toBeInTheDocument();
  });
});

// #394 — the actual gap this issue closed: FlipTable's turnDeadline prop
// and the whole countdown/timeout hook underneath it were real but
// permanently null, because FlipGameRoot never passed the wire field
// through to it. This proves the wiring, not just that FlipTable can
// render a countdown when handed one directly (FlipTable.test.tsx already
// covers that in isolation).
describe("FlipGameRoot — turnDeadline wiring (#394)", () => {
  it("passes flip.turnDeadline through to FlipTable, so a live deadline shows a countdown", () => {
    const flip = makeFlip({ turnDeadline: Date.now() + 5_000 }); // within the 15s visible window
    render(
      <FlipGameRoot
        flip={flip}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );
    expect(screen.getByTestId("turn-countdown")).toBeInTheDocument();
  });

  it("shows no countdown when the server sends turnDeadline: null", () => {
    const flip = makeFlip({ turnDeadline: null });
    render(
      <FlipGameRoot
        flip={flip}
        localPlayerId="p1"
        onHit={noop}
        onFreeze={noop}
        onChooseFreezeTarget={noop}
        onChooseFlip3Target={noop}
        onStartRound={noop}
      />,
    );
    expect(screen.queryByTestId("turn-countdown")).not.toBeInTheDocument();
  });
});
