import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  FlipScoreboard,
  cumulativeTotal,
  describeRound,
  type FlipRoundScore,
  type FlipScoreboardPlayer,
} from "../app/components/flip/FlipScoreboard";

// #365 — the scoreboard displays scores the engine awarded; it never computes
// one. These tests pin that: every expected total is the sum of given `score`
// values, and the breakdown assertions are about what is *shown*, not about
// arithmetic the component performs.

const round = (over: Partial<FlipRoundScore> = {}): FlipRoundScore => ({
  roundNumber: 1,
  score: 12,
  busted: false,
  flip7: false,
  breakdown: { numbersSum: 12, plusSum: 0, hasX2: false, flip7Bonus: 0, total: 12, busted: false },
  ...over,
});

const player = (over: Partial<FlipScoreboardPlayer> = {}): FlipScoreboardPlayer => ({
  id: "p1",
  name: "Dev",
  rounds: [round()],
  ...over,
});

describe("cumulativeTotal", () => {
  it("sums the scores the engine awarded", () => {
    expect(cumulativeTotal([round({ score: 12 }), round({ roundNumber: 2, score: 30 })])).toBe(42);
  });

  it("is 0 for a player with no rounds yet", () => {
    expect(cumulativeTotal([])).toBe(0);
  });

  // #358: a busted hand scores 0 regardless of what it held, modifiers
  // included. The scoreboard must add that 0, not the hand's face value.
  it("counts a busted round as the 0 it was scored, not the cards held", () => {
    const busted = round({
      score: 0,
      busted: true,
      breakdown: { numbersSum: 0, plusSum: 0, hasX2: false, flip7Bonus: 0, total: 0, busted: true },
    });
    expect(cumulativeTotal([round({ score: 20 }), busted])).toBe(20);
  });
});

describe("describeRound", () => {
  it("says 'bust' for a busted round", () => {
    expect(describeRound(round({ busted: true, score: 0 }))).toBe("bust");
  });

  it("returns null when a plain number hand already explains itself", () => {
    expect(describeRound(round())).toBeNull();
  });

  it("shows the + cards as a separate addend", () => {
    expect(
      describeRound(round({
        score: 16,
        breakdown: { numbersSum: 12, plusSum: 4, hasX2: false, flip7Bonus: 0, total: 16, busted: false },
      })),
    ).toBe("12 + 4");
  });

  // #365 AC: a x2 round shows the multiplier applied.
  it("shows the x2 multiplier rather than folding it into the total", () => {
    expect(
      describeRound(round({
        score: 32,
        breakdown: { numbersSum: 12, plusSum: 4, hasX2: true, flip7Bonus: 0, total: 32, busted: false },
      })),
    ).toBe("12 + 4 ×2");
  });

  // #365 AC: a Flip 7 shows the +15 as a distinct line, not folded silently.
  it("shows the Flip 7 bonus as its own term", () => {
    expect(
      describeRound(round({
        score: 33,
        flip7: true,
        breakdown: { numbersSum: 18, plusSum: 0, hasX2: false, flip7Bonus: 15, total: 33, busted: false },
      })),
    ).toBe("18 + 15 bonus");
  });

  // #358: the bonus is added AFTER the multiplier and is never doubled, so
  // the two must read as separate terms — 15 x2 + 15 would be wrong.
  it("keeps the multiplier and the bonus as separate terms", () => {
    expect(
      describeRound(round({
        score: 45,
        flip7: true,
        breakdown: { numbersSum: 15, plusSum: 0, hasX2: true, flip7Bonus: 15, total: 45, busted: false },
      })),
    ).toBe("15 ×2 + 15 bonus");
  });

  // Rounds scored before migration 017 have no breakdown. Absence must
  // degrade to showing the plain total, never to hiding the round.
  it("returns null when no breakdown was stored", () => {
    expect(describeRound(round({ breakdown: null }))).toBeNull();
  });
});

describe("FlipScoreboard", () => {
  it("renders one row per player using their lobby name", () => {
    render(
      <FlipScoreboard
        players={[
          player({ id: "p1", name: "Dev" }),
          player({ id: "p2", name: "Alice" }),
        ]}
      />,
    );

    expect(screen.getByRole("row", { name: /Dev/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Alice/ })).toBeInTheDocument();
  });

  it("shows a column per round played and a cumulative total", () => {
    render(
      <FlipScoreboard
        players={[
          player({
            rounds: [round({ roundNumber: 1, score: 12 }), round({ roundNumber: 2, score: 30 })],
          }),
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "R1" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "R2" })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Dev/ });
    expect(within(row).getByText("42")).toBeInTheDocument();
  });

  it("shows a dash for a round a player has no score for", () => {
    render(
      <FlipScoreboard
        players={[
          player({ id: "p1", name: "Dev", rounds: [round({ roundNumber: 1 })] }),
          player({ id: "p2", name: "Alice", rounds: [round({ roundNumber: 2 })] }),
        ]}
      />,
    );

    const devRow = screen.getByRole("row", { name: /Dev/ });
    expect(within(devRow).getByText("–")).toBeInTheDocument();
  });

  it("marks a player at or past the win threshold", () => {
    render(
      <FlipScoreboard
        players={[
          player({ id: "p1", name: "Dev", rounds: [round({ score: 201 })] }),
          player({ id: "p2", name: "Alice", rounds: [round({ score: 199 })] }),
        ]}
      />,
    );

    const devRow = screen.getByRole("row", { name: /Dev/ });
    const aliceRow = screen.getByRole("row", { name: /Alice/ });
    expect(within(devRow).getByText("200+")).toBeInTheDocument();
    expect(within(aliceRow).queryByText("200+")).toBeNull();
  });

  it("marks a player who is exactly at the threshold, not only past it", () => {
    render(<FlipScoreboard players={[player({ rounds: [round({ score: 200 })] })]} />);
    expect(screen.getByText("200+")).toBeInTheDocument();
  });

  it("renders the breakdown inline under the round score", () => {
    render(
      <FlipScoreboard
        players={[
          player({
            rounds: [round({
              score: 32,
              breakdown: { numbersSum: 12, plusSum: 4, hasX2: true, flip7Bonus: 0, total: 32, busted: false },
            })],
          }),
        ]}
      />,
    );

    // With a single round the round cell and the total cell hold the same
    // number, so both are asserted by cell position rather than by text.
    const cells = within(screen.getByRole("row", { name: /Dev/ })).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("32");
    expect(cells[0]).toHaveTextContent("12 + 4 ×2");
    expect(cells[cells.length - 1]).toHaveTextContent("32");
  });

  it("still renders a round whose breakdown was never stored", () => {
    render(<FlipScoreboard players={[player({ rounds: [round({ score: 12, breakdown: null })] })]} />);

    const cells = within(screen.getByRole("row", { name: /Dev/ })).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("12");
    expect(cells[cells.length - 1]).toHaveTextContent("12");
  });

  it("renders five players, the maximum table size", () => {
    const names = ["Dev", "Alice", "Bob", "Carol", "Erin"];
    render(
      <FlipScoreboard
        players={names.map((name, i) => player({ id: `p${i}`, name }))}
      />,
    );

    for (const name of names) {
      expect(screen.getByRole("row", { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it("renders with no rounds played yet", () => {
    render(<FlipScoreboard players={[player({ rounds: [] })]} />);
    const row = screen.getByRole("row", { name: /Dev/ });
    expect(within(row).getByText("0")).toBeInTheDocument();
  });
});
