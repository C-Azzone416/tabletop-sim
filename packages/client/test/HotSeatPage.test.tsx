import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createHotSeatSession: vi.fn() }));
vi.mock("../app/spades/hot-seat-session", () => ({
  createHotSeatSession: mocks.createHotSeatSession,
}));
vi.mock("../app/components/spades/HotSeatGame", () => ({
  HotSeatGame: () => <p>Game started</p>,
}));

import HotSeatPage from "../app/spades/hot-seat/page";

describe("HotSeatPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a useful error and re-enables dealing when setup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createHotSeatSession.mockRejectedValueOnce(new Error("deal failed"));
    render(<HotSeatPage />);

    fireEvent.click(screen.getByRole("button", { name: "Deal cards" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t deal");
    expect(screen.getByRole("button", { name: "Deal cards" })).toBeEnabled();
    consoleError.mockRestore();
  });

  it("enters the game after a successful deal", async () => {
    mocks.createHotSeatSession.mockResolvedValueOnce({ state: {}, activeHumanSeat: "south", confirmedSeat: "south" });
    render(<HotSeatPage />);
    fireEvent.click(screen.getByRole("button", { name: "Deal cards" }));
    expect(await screen.findByText("Game started")).toBeVisible();
  });

  it("submits edited players, bot difficulties, and target score", async () => {
    mocks.createHotSeatSession.mockResolvedValueOnce({ state: {}, activeHumanSeat: "south", confirmedSeat: "south" });
    render(<HotSeatPage />);

    fireEvent.change(screen.getByLabelText("People on this device"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Player 1"), { target: { value: "Ben" } });
    fireEvent.change(screen.getByLabelText("Player 2"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Computer 1"), { target: { value: "hard" } });
    fireEvent.change(screen.getByLabelText("Computer 2"), { target: { value: "easy" } });
    fireEvent.click(screen.getByRole("button", { name: "750" }));
    fireEvent.click(screen.getByRole("button", { name: "Deal cards" }));

    expect(await screen.findByText("Game started")).toBeVisible();
    expect(mocks.createHotSeatSession).toHaveBeenCalledWith({
      humans: [
        { id: "hot-seat-1", name: "Ben" },
        { id: "hot-seat-2", name: "Player 2" },
      ],
      botDifficulties: ["hard", "easy"],
      targetScore: 750,
    });
  });

  it("locks the deal button while setup is pending", async () => {
    let finishDeal!: (session: unknown) => void;
    mocks.createHotSeatSession.mockImplementationOnce(() => new Promise((resolve) => {
      finishDeal = resolve;
    }));
    render(<HotSeatPage />);

    fireEvent.click(screen.getByRole("button", { name: "Deal cards" }));
    expect(screen.getByRole("button", { name: "Dealing…" })).toBeDisabled();

    finishDeal({ state: {}, activeHumanSeat: "south", confirmedSeat: "south" });
    expect(await screen.findByText("Game started")).toBeVisible();
  });
});
