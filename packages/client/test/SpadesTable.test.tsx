import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CardInstance } from "@tabletop/cards";
import type { CompletedTrick, SpadesPlayerView } from "@tabletop/game-spades";
import { RESOLVED_TRICK_DISPLAY_MS, SpadesTable } from "../app/components/spades/SpadesTable";

const cards: CardInstance[] = [
  { id: "club-2", deckIndex: 0, suit: "clubs", rank: "2" },
  { id: "heart-a", deckIndex: 0, suit: "hearts", rank: "ace" },
  { id: "spade-k", deckIndex: 0, suit: "spades", rank: "king" },
];

const completed = (number: number): CompletedTrick => ({
  winner: "south",
  leadSuit: "clubs",
  plays: [
    { seat: "north", card: { id: `book-${number}-n`, deckIndex: 0, suit: "clubs", rank: "king" } },
    { seat: "east", card: { id: `book-${number}-e`, deckIndex: 0, suit: "clubs", rank: "2" } },
    { seat: "south", card: { id: `book-${number}-s`, deckIndex: 0, suit: "spades", rank: "3" } },
    { seat: "west", card: { id: `book-${number}-w`, deckIndex: 0, suit: "clubs", rank: "ace" } },
  ],
});

function makeView(overrides: Partial<SpadesPlayerView> = {}): SpadesPlayerView {
  return {
    phase: "playing",
    targetScore: 250,
    handNumber: 1,
    players: [
      { id: "n", name: "Ari", seat: "north", team: "north-south", isBot: true, difficulty: "easy" },
      { id: "e", name: "Mira", seat: "east", team: "east-west", isBot: true, difficulty: "normal" },
      { id: "s", name: "Ben", seat: "south", team: "north-south", isBot: false },
      { id: "w", name: "Finn", seat: "west", team: "east-west", isBot: true, difficulty: "hard" },
    ],
    dealer: "north",
    currentSeat: "south",
    hand: cards,
    opponentHandCounts: { north: 3, east: 3, south: 0, west: 3 },
    blindNilChoicesMade: 4,
    bids: {
      north: { kind: "normal", tricks: 3 },
      east: { kind: "nil" },
      south: { kind: "normal", tricks: 4 },
      west: { kind: "blind-nil" },
    },
    currentTrick: {
      leader: "north",
      plays: [{ seat: "north", card: { id: "lead", deckIndex: 0, suit: "clubs", rank: "king" } }],
    },
    completedTricks: [],
    tricksWon: { north: 1, east: 0, south: 2, west: 0 },
    scores: { "north-south": { score: 120, bags: 2 }, "east-west": { score: 85, bags: 5 } },
    spadesBroken: false,
    winner: null,
    ...overrides,
  };
}

const handlers = () => ({ onBlindNilChoice: vi.fn(), onBid: vi.fn(), onPlayCard: vi.fn() });

describe("SpadesTable", () => {
  it("sorts the hand by suit and descending rank", () => {
    render(<SpadesTable view={makeView()} viewingSeat="south" {...handlers()} />);
    const labels = within(screen.getByTestId("player-hand"))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(labels).toEqual(["K of Spades", "A of Hearts", "2 of Clubs"]);
  });

  it("keeps the current trick visible while concealing the hand", () => {
    render(<SpadesTable view={makeView()} viewingSeat="south" concealHand {...handlers()} />);
    expect(screen.getByLabelText("Current trick")).toHaveTextContent("K ♣");
    expect(screen.getByLabelText("Ari played K of Clubs")).toHaveTextContent("Ari");
    expect(screen.getByLabelText("Ari played K of Clubs")).toHaveTextContent("north");
    expect(screen.queryByLabelText("Your hand")).not.toBeInTheDocument();
  });

  it("shows score, bids, tricks, settled bags, and pending bags", () => {
    render(<SpadesTable view={makeView()} viewingSeat="south" {...handlers()} />);
    const scoreboard = screen.getByLabelText("Live scoreboard");
    expect(scoreboard).toHaveTextContent("North / South");
    expect(scoreboard).toHaveTextContent("Ari + Ben");
    expect(scoreboard).toHaveTextContent("Your team");
    expect(scoreboard).toHaveTextContent("120");
    expect(scoreboard).toHaveTextContent("7");
    expect(scoreboard).toHaveTextContent("3");
    expect(scoreboard).toHaveTextContent("2");
  });

  it("keeps the required phase action in the center of the table", () => {
    render(<SpadesTable view={makeView({ phase: "bidding" })} viewingSeat="south" {...handlers()} />);
    expect(within(screen.getByLabelText("Current trick")).getByLabelText("Bid controls")).toBeVisible();
    expect(within(screen.getByLabelText("Your hand")).queryByLabelText("Bid controls")).not.toBeInTheDocument();
  });

  it("shows all four resolved cards briefly, then clears for the next lead", () => {
    vi.useFakeTimers();
    try {
      render(<SpadesTable
        view={makeView({
          currentTrick: { leader: "south", plays: [] },
          completedTricks: [completed(1)],
        })}
        viewingSeat="south"
        {...handlers()}
      />);

      const table = screen.getByLabelText("Current trick");
      expect(table).toHaveTextContent("Ben won trick 1");
      expect(within(table).getAllByLabelText(/played/)).toHaveLength(4);

      act(() => vi.advanceTimersByTime(RESOLVED_TRICK_DISPLAY_MS));
      expect(within(table).queryAllByLabelText(/played/)).toHaveLength(0);
      expect(table).toHaveTextContent("Ben leads");
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the most recent trick and confirms before browsing farther back", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SpadesTable view={makeView({ completedTricks: [completed(1), completed(2)] })} viewingSeat="south" {...handlers()} />);

    fireEvent.click(screen.getByRole("button", { name: "Last won trick (2)" }));
    expect(screen.getByRole("dialog", { name: "Trick review" })).toHaveTextContent("Trick 2 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Earlier trick" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Trick review" })).toHaveTextContent("Trick 2 of 2");
    confirm.mockRestore();
  });
});
