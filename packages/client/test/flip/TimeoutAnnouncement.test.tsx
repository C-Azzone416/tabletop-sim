import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeoutAnnouncement } from "../../app/components/flip/TimeoutAnnouncement";

describe("TimeoutAnnouncement", () => {
  it("renders nothing without a message", () => {
    const { container } = render(<TimeoutAnnouncement message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the message as a status region", () => {
    render(<TimeoutAnnouncement message="Alice's gone quiet — froze for the round." />);
    expect(screen.getByTestId("timeout-announcement")).toHaveTextContent(
      "Alice's gone quiet — froze for the round.",
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
