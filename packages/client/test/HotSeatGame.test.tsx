import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HotSeatSession } from "../app/spades/hot-seat-session";

const mocks = vi.hoisted(() => ({
  buildHotSeatView: vi.fn(),
  confirmHotSeat: vi.fn(),
  hotSeatBlindNil: vi.fn(),
  hotSeatBid: vi.fn(),
  hotSeatPlay: vi.fn(),
  hotSeatContinueHand: vi.fn(),
}));

vi.mock("../app/spades/hot-seat-session", () => mocks);
vi.mock("../app/components/spades/SpadesTable", () => ({
  SpadesTable: (props: {
    view: { phase?: string };
    concealHand?: boolean;
    onBlindNilChoice: (choice: boolean) => void;
    onBid: (bid: { kind: "normal"; tricks: number }) => void;
    onPlayCard: (cardId: string) => void;
    onContinueHand: () => void;
  }) => (
    <section aria-label="Mock Spades table">
      <span>{props.view.phase}</span>
      <span>{props.concealHand ? "Hand concealed" : "Hand visible"}</span>
      <button onClick={() => props.onBlindNilChoice(false)}>Blind nil choice</button>
      <button onClick={() => props.onBid({ kind: "normal", tricks: 2 })}>Bid two</button>
      <button onClick={() => props.onPlayCard("card-1")}>Play card</button>
      <button onClick={props.onContinueHand}>Continue hand</button>
    </section>
  ),
}));

import { HotSeatGame } from "../app/components/spades/HotSeatGame";

function makeSession(overrides: Partial<HotSeatSession> = {}): HotSeatSession {
  const session = {
    state: {
      phase: "bidding",
      winner: null,
      players: [
        { id: "human-1", name: "Alice", seat: "south", team: "north-south", isBot: false },
      ],
    },
    activeHumanSeat: "south",
    confirmedSeat: "south",
    ...overrides,
  };
  return session as HotSeatSession;
}

describe("HotSeatGame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildHotSeatView.mockImplementation((session: HotSeatSession) => ({ phase: session.state.phase }));
    mocks.confirmHotSeat.mockImplementation((session: HotSeatSession, seat: string) => ({ ...session, confirmedSeat: seat }));
    for (const action of [mocks.hotSeatBlindNil, mocks.hotSeatBid, mocks.hotSeatPlay, mocks.hotSeatContinueHand]) {
      action.mockImplementation(async (session: HotSeatSession) => session);
    }
  });

  it("keeps the hand concealed until the named player confirms the handoff", () => {
    const session = makeSession({ confirmedSeat: null });
    render(<HotSeatGame initialSession={session} />);

    expect(screen.getByLabelText("Pass the device")).toBeVisible();
    expect(screen.getByText("Hand concealed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "I am Alice" }));

    expect(mocks.confirmHotSeat).toHaveBeenCalledWith(session, "south");
    expect(screen.queryByLabelText("Pass the device")).toBeNull();
  });

  it("wires the table controls to every hot-seat session action", async () => {
    const session = makeSession();
    render(<HotSeatGame initialSession={session} />);

    fireEvent.click(screen.getByRole("button", { name: "Blind nil choice" }));
    await waitFor(() => expect(mocks.hotSeatBlindNil).toHaveBeenCalledWith(session, false, expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: "Bid two" }));
    await waitFor(() => expect(mocks.hotSeatBid).toHaveBeenCalledWith(session, { kind: "normal", tricks: 2 }, expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: "Play card" }));
    await waitFor(() => expect(mocks.hotSeatPlay).toHaveBeenCalledWith(session, "card-1", expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: "Continue hand" }));
    await waitFor(() => expect(mocks.hotSeatContinueHand).toHaveBeenCalledWith(session, expect.any(Object)));
  });

  it("rolls back an interrupted bot sequence and gives the player a retryable error", async () => {
    const session = makeSession();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.hotSeatBid.mockImplementation(async (_session: HotSeatSession, _bid: unknown, options: { onState?: (state: unknown) => Promise<void> }) => {
      await options.onState?.({ ...session.state, phase: "playing" });
      throw new Error("bot failed");
    });

    render(<HotSeatGame initialSession={session} />);
    fireEvent.click(screen.getByRole("button", { name: "Bid two" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("table was restored");
    expect(screen.getByLabelText("Mock Spades table")).toHaveTextContent("bidding");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
    consoleError.mockRestore();
  });

  it("renders the winning team when the match is finished", () => {
    const session = makeSession({
      state: { ...makeSession().state, phase: "finished", winner: "north-south" },
      activeHumanSeat: null,
      confirmedSeat: null,
    });
    render(<HotSeatGame initialSession={session} />);
    expect(screen.getByRole("heading", { name: "Game over" })).toBeVisible();
    expect(screen.getByText("North / South wins")).toBeVisible();
  });
});
