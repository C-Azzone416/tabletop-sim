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
});
