import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MissionProgress } from "../app/components/MissionProgress";
import { LAST_MISSION } from "../app/lib/missions";

describe("MissionProgress (#170)", () => {
  it("renders one indicator per mission, 1 through LAST_MISSION", () => {
    render(<MissionProgress outcomes={{}} />);
    for (let mission = 1; mission <= LAST_MISSION; mission++) {
      expect(screen.getByTestId(`mission-progress-${mission}`)).toBeInTheDocument();
    }
  });

  it("shows a check mark and no X for a beaten mission", () => {
    render(<MissionProgress outcomes={{ 1: "won" }} />);
    const badge = screen.getByTestId("mission-progress-1");
    expect(badge).toHaveTextContent("✓");
    expect(badge).not.toHaveTextContent("✗");
  });

  it("shows an X and no check mark for a tried-but-failed mission", () => {
    render(<MissionProgress outcomes={{ 2: "lost" }} />);
    const badge = screen.getByTestId("mission-progress-2");
    expect(badge).toHaveTextContent("✗");
    expect(badge).not.toHaveTextContent("✓");
  });

  it("shows neither mark for a never-played mission", () => {
    render(<MissionProgress outcomes={{}} />);
    const badge = screen.getByTestId("mission-progress-3");
    expect(badge).not.toHaveTextContent("✓");
    expect(badge).not.toHaveTextContent("✗");
    expect(badge).toHaveTextContent("3");
  });

  it("a later win upgrades styling independently of other missions (per-mission, not global)", () => {
    render(<MissionProgress outcomes={{ 1: "won", 2: "lost", 3: undefined as never }} />);
    expect(screen.getByTestId("mission-progress-1")).toHaveTextContent("✓");
    expect(screen.getByTestId("mission-progress-2")).toHaveTextContent("✗");
    expect(screen.getByTestId("mission-progress-3")).not.toHaveTextContent("✓");
    expect(screen.getByTestId("mission-progress-3")).not.toHaveTextContent("✗");
  });
});
