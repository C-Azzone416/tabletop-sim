import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TurnCountdown } from "../app/components/TurnCountdown";

describe("TurnCountdown", () => {
  it("renders nothing without a countdown", () => {
    const { container } = render(<TurnCountdown secondsRemaining={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the seconds remaining", () => {
    render(<TurnCountdown secondsRemaining={7} />);
    expect(screen.getByTestId("turn-countdown")).toHaveTextContent("7s");
  });

  it("marks the last few seconds as assertive/urgent", () => {
    render(<TurnCountdown secondsRemaining={2} />);
    expect(screen.getByTestId("turn-countdown")).toHaveAttribute("aria-live", "assertive");
  });

  it("is only polite outside the urgent window", () => {
    render(<TurnCountdown secondsRemaining={8} />);
    expect(screen.getByTestId("turn-countdown")).toHaveAttribute("aria-live", "polite");
  });
});
