import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../../app/components/flip/Card";

describe("Card", () => {
  it("renders a number card's value", () => {
    render(<Card card={{ id: "c1", kind: "number", value: 9 }} />);
    expect(screen.getByTestId("card-c1")).toHaveTextContent("9");
  });

  it("renders a modifier card's label", () => {
    render(<Card card={{ id: "c2", kind: "modifier", modifier: "x2" }} />);
    expect(screen.getByTestId("card-c2")).toHaveTextContent("x2");
  });

  it("renders an action card with both an icon and a text label, never colour alone", () => {
    render(<Card card={{ id: "c3", kind: "action", action: "second-chance" }} />);
    const el = screen.getByTestId("card-c3");
    expect(el).toHaveTextContent("2nd Chance");
    expect(el).toHaveTextContent("♥");
  });

  it.each([
    ["freeze", "Freeze"],
    ["flip3", "Flip 3"],
    ["second-chance", "2nd Chance"],
  ] as const)("labels the %s action card as %s", (action, label) => {
    render(<Card card={{ id: "c4", kind: "action", action }} />);
    expect(screen.getByTestId("card-c4")).toHaveTextContent(label);
  });
});
