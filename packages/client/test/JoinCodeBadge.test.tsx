import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JoinCodeBadge } from "../app/components/JoinCodeBadge";

describe("JoinCodeBadge", () => {
  it("displays the join code", () => {
    render(<JoinCodeBadge joinCode="ABC123" />);
    expect(screen.getByText("ABC123")).toBeInTheDocument();
  });
});
