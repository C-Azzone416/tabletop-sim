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
    render(<GameOverOverlay result="won" reason="All values validated!" />);
    expect(screen.getByText("Mission Complete!")).toBeInTheDocument();
    expect(screen.getByText("All values validated!")).toBeInTheDocument();
  });

  it("displays loss state correctly", () => {
    render(<GameOverOverlay result="lost" reason="Detonator exploded!" />);
    expect(screen.getByText("Mission Failed")).toBeInTheDocument();
    expect(screen.getByText("Detonator exploded!")).toBeInTheDocument();
  });

  it("navigates home on button click", async () => {
    const user = userEvent.setup();
    render(<GameOverOverlay result="won" reason="You did it!" />);
    await user.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
