import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeatRail } from "../../app/components/flip/SeatRail";
import type { FlipSeat } from "../../app/components/flip/types";

function makeSeat(overrides: Partial<FlipSeat> = {}): FlipSeat {
  return {
    id: "s1",
    name: "Alice",
    order: 0,
    isActive: false,
    isDealer: false,
    isFrozen: false,
    isBusted: false,
    cardCount: 3,
    ...overrides,
  };
}

describe("SeatRail", () => {
  it("renders seats in turn order regardless of array order", () => {
    render(
      <SeatRail
        seats={[
          makeSeat({ id: "s3", name: "Cara", order: 2 }),
          makeSeat({ id: "s1", name: "Alice", order: 0 }),
          makeSeat({ id: "s2", name: "Bea", order: 1 }),
        ]}
      />,
    );
    const rail = screen.getByTestId("seat-rail");
    const names = Array.from(rail.querySelectorAll("li")).map((li) => li.textContent);
    expect(names[0]).toContain("Alice");
    expect(names[1]).toContain("Bea");
    expect(names[2]).toContain("Cara");
  });

  it("marks the active seat with data-active", () => {
    render(
      <SeatRail
        seats={[makeSeat({ id: "s1", isActive: true }), makeSeat({ id: "s2", order: 1 })]}
      />,
    );
    expect(screen.getByTestId("seat-s1")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("seat-s2")).toHaveAttribute("data-active", "false");
  });

  it("shows a dealer indicator only for the dealer", () => {
    render(
      <SeatRail
        seats={[makeSeat({ id: "s1", isDealer: true }), makeSeat({ id: "s2", order: 1 })]}
      />,
    );
    expect(screen.getByTestId("seat-s1")).toHaveTextContent("Dealer");
    expect(screen.getByTestId("seat-s2")).not.toHaveTextContent("Dealer");
  });

  it("shows a frozen indicator for a frozen seat", () => {
    render(<SeatRail seats={[makeSeat({ isFrozen: true })]} />);
    expect(screen.getByText(/Frozen/)).toBeInTheDocument();
  });

  it("shows a busted indicator for a busted seat", () => {
    render(<SeatRail seats={[makeSeat({ isBusted: true })]} />);
    expect(screen.getByText(/Busted/)).toBeInTheDocument();
  });

  it("always renders the card count, even for a truncated long name", () => {
    render(<SeatRail seats={[makeSeat({ name: "A Very Long Player Name Indeed", cardCount: 7 })]} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
