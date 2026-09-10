import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CardsRemaining } from "../../app/components/flip/CardsRemaining";

describe("CardsRemaining", () => {
  it("pluralizes correctly", () => {
    render(<CardsRemaining count={1} />);
    expect(screen.getByTestId("cards-remaining")).toHaveTextContent("1 card left in the shoe");
  });

  it("shows the plural form for any other count", () => {
    render(<CardsRemaining count={42} />);
    expect(screen.getByTestId("cards-remaining")).toHaveTextContent("42 cards left in the shoe");
  });
});
