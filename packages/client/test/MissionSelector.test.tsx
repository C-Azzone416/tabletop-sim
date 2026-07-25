import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MissionSelector } from "../app/components/MissionSelector";

describe("MissionSelector", () => {
  it("renders all 8 missions and highlights the selected one", () => {
    render(<MissionSelector selectedMission={3} onSelectMission={() => {}} highestUnlocked={8} />);
    expect(screen.getByRole("button", { name: /Mission 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mission 8/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mission 3/ }).className).toContain(
      "border-blue-500",
    );
  });

  it("calls onSelectMission with the clicked mission number", async () => {
    const user = userEvent.setup();
    const onSelectMission = vi.fn();
    render(<MissionSelector selectedMission={1} onSelectMission={onSelectMission} highestUnlocked={8} />);
    await user.click(screen.getByRole("button", { name: /Mission 5/ }));
    expect(onSelectMission).toHaveBeenCalledWith(5);
  });

  describe("beat-to-unlock gating (#179)", () => {
    it("renders missions past highestUnlocked as locked, not clickable buttons", () => {
      render(<MissionSelector selectedMission={1} onSelectMission={() => {}} highestUnlocked={2} />);
      expect(screen.getByRole("button", { name: /Mission 1/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Mission 2/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Mission 3/ })).not.toBeInTheDocument();
      expect(screen.getByTestId("mission-locked-3")).toBeInTheDocument();
    });

    it("shows a lock icon and the beat-to-unlock message on a locked mission", () => {
      render(<MissionSelector selectedMission={1} onSelectMission={() => {}} highestUnlocked={2} />);
      const locked = screen.getByTestId("mission-locked-3");
      expect(locked.textContent).toContain("🔒");
      expect(locked.textContent).toContain("Beat mission 2 to unlock");
    });

    it("never calls onSelectMission for a locked mission (no click handler to fire)", async () => {
      const user = userEvent.setup();
      const onSelectMission = vi.fn();
      render(<MissionSelector selectedMission={1} onSelectMission={onSelectMission} highestUnlocked={2} />);
      await user.click(screen.getByTestId("mission-locked-3"));
      expect(onSelectMission).not.toHaveBeenCalled();
    });

    it("unlocks every mission when highestUnlocked is LAST_MISSION (dev bypass)", () => {
      render(<MissionSelector selectedMission={1} onSelectMission={() => {}} highestUnlocked={8} />);
      expect(screen.queryByTestId(/mission-locked-/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Mission 8/ })).toBeInTheDocument();
    });
  });
});
