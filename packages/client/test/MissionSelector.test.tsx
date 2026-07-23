import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MissionSelector } from "../app/components/MissionSelector";

describe("MissionSelector", () => {
  it("renders all 8 missions and highlights the selected one", () => {
    render(<MissionSelector selectedMission={3} onSelectMission={() => {}} />);
    expect(screen.getByRole("button", { name: /Mission 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mission 8/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mission 3/ }).className).toContain(
      "border-blue-500",
    );
  });

  it("calls onSelectMission with the clicked mission number", async () => {
    const user = userEvent.setup();
    const onSelectMission = vi.fn();
    render(<MissionSelector selectedMission={1} onSelectMission={onSelectMission} />);
    await user.click(screen.getByRole("button", { name: /Mission 5/ }));
    expect(onSelectMission).toHaveBeenCalledWith(5);
  });
});
