import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameOverOverlay } from "../app/components/GameOverOverlay";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("GameOverOverlay", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("displays win state correctly", () => {
    render(
      <GameOverOverlay
        result="won"
        reason="All values validated!"
        isCaptain={false}
        currentMission={1}
        onNextMission={() => {}}
      />,
    );
    expect(screen.getByText("Mission Complete!")).toBeInTheDocument();
    expect(screen.getByText("All values validated!")).toBeInTheDocument();
  });

  it("displays loss state correctly", () => {
    render(
      <GameOverOverlay
        result="lost"
        reason="Detonator exploded!"
        isCaptain={false}
        currentMission={1}
        onNextMission={() => {}}
      />,
    );
    expect(screen.getByText("Mission Failed")).toBeInTheDocument();
    expect(screen.getByText("Detonator exploded!")).toBeInTheDocument();
  });

  it("navigates home on button click", async () => {
    const user = userEvent.setup();
    render(
      <GameOverOverlay
        result="won"
        reason="You did it!"
        isCaptain={false}
        currentMission={1}
        onNextMission={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("non-captain sees a waiting message instead of mission controls", () => {
    render(
      <GameOverOverlay
        result="won"
        reason="All values validated!"
        isCaptain={false}
        currentMission={2}
        onNextMission={() => {}}
      />,
    );
    expect(
      screen.getByText("Waiting for the captain to choose the next mission..."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Next Mission/ })).not.toBeInTheDocument();
  });

  it("captain on a win sees a Next Mission button defaulting to mission+1", async () => {
    const user = userEvent.setup();
    const onNextMission = vi.fn();
    render(
      <GameOverOverlay
        result="won"
        reason="All values validated!"
        isCaptain
        currentMission={2}
        onNextMission={onNextMission}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Next Mission (3)" }));
    expect(onNextMission).toHaveBeenCalledWith(3);
  });

  it("captain on a win can open the mission picker and choose a different mission", async () => {
    const user = userEvent.setup();
    const onNextMission = vi.fn();
    render(
      <GameOverOverlay
        result="won"
        reason="All values validated!"
        isCaptain
        currentMission={2}
        onNextMission={onNextMission}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pick a Different Mission" }));
    await user.click(screen.getByRole("button", { name: /Mission 5/ }));
    await user.click(screen.getByRole("button", { name: "Start Mission 5" }));
    expect(onNextMission).toHaveBeenCalledWith(5);
  });

  it("captain on a loss sees a Retry Mission shortcut for the same mission", async () => {
    const user = userEvent.setup();
    const onNextMission = vi.fn();
    render(
      <GameOverOverlay
        result="lost"
        reason="Detonator exploded!"
        isCaptain
        currentMission={4}
        onNextMission={onNextMission}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Retry Mission 4" }));
    expect(onNextMission).toHaveBeenCalledWith(4);
  });

  it("clamps the default next-mission-up at the last mission", () => {
    render(
      <GameOverOverlay
        result="won"
        reason="All values validated!"
        isCaptain
        currentMission={8}
        onNextMission={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Next Mission (8)" })).toBeInTheDocument();
  });
});
