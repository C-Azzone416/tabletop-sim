import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hand } from "../../app/components/flip/Hand";

describe("Hand", () => {
  it("renders every card face up, always", () => {
    render(
      <Hand
        cards={[
          { id: "c1", kind: "number", value: 3 },
          { id: "c2", kind: "action", action: "freeze" },
        ]}
      />,
    );
    expect(screen.getByTestId("card-c1")).toBeInTheDocument();
    expect(screen.getByTestId("card-c2")).toBeInTheDocument();
  });

  it("shows an empty-hand message with zero cards", () => {
    render(<Hand cards={[]} />);
    expect(screen.getByTestId("hand-empty")).toBeInTheDocument();
  });
});
