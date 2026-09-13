import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableSeating } from "../../app/components/flip/TableSeating";
import type { FlipCardInstance } from "../../app/components/flip/engine-types";

const card = (id: string): FlipCardInstance => ({ id, kind: "number", value: 5 });

const players = [
  { id: "p1", name: "Alice", hand: [card("a1")] },
  { id: "p2", name: "Bea", hand: [card("b1")] },
  { id: "p3", name: "Cal", hand: [card("c1")] },
  { id: "p4", name: "Dee", hand: [card("d1")] },
  { id: "p5", name: "Eli", hand: [card("e1")] },
];

describe("TableSeating", () => {
  it("labels the local player's own seat 'You', not their name", () => {
    render(<TableSeating players={players.slice(0, 2)} localPlayerId="p1" />);
    expect(screen.getByTestId("seat-p1")).toHaveTextContent("You");
    expect(screen.getByTestId("seat-p1")).not.toHaveTextContent("Alice");
  });

  it("renders every seat's cards face up, regardless of whose turn or view it is", () => {
    render(<TableSeating players={players.slice(0, 3)} localPlayerId="p2" />);
    expect(screen.getByTestId("card-a1")).toBeInTheDocument();
    expect(screen.getByTestId("card-b1")).toBeInTheDocument();
    expect(screen.getByTestId("card-c1")).toBeInTheDocument();
  });

  it("puts the local seat at grid row 3, full width, regardless of turn-order position", () => {
    render(<TableSeating players={players.slice(0, 4)} localPlayerId="p3" />);
    const localSeat = screen.getByTestId("seat-p3");
    expect(localSeat).toHaveStyle({ gridRow: "3" });
  });

  it.each([
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 4],
  ])("renders exactly %i seats total for a %i-opponent table", (totalPlayers) => {
    render(<TableSeating players={players.slice(0, totalPlayers)} localPlayerId="p1" />);
    expect(screen.getAllByTestId(/^seat-/)).toHaveLength(totalPlayers);
  });

  it("places a lone opponent across the full far edge (row 1, spanning all columns)", () => {
    render(<TableSeating players={players.slice(0, 2)} localPlayerId="p1" />);
    const opponentSeat = screen.getByTestId("seat-p2");
    expect(opponentSeat).toHaveStyle({ gridRow: "1" });
  });

  it("keeps opponents in turn order starting after the local seat, wrapping around", () => {
    // p3 is local; turn order is p1,p2,p3,p4 — opponents should read p4, p1, p2.
    render(<TableSeating players={players.slice(0, 4)} localPlayerId="p3" />);
    const seatIds = screen.getAllByTestId(/^seat-/).map((el) => el.dataset.testid);
    expect(seatIds).toEqual(["seat-p4", "seat-p1", "seat-p2", "seat-p3"]);
  });
});
