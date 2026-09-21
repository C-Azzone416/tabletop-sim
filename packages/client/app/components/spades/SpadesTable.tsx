"use client";

import { useEffect, useState } from "react";
import type { CardInstance } from "@tabletop/cards";
import {
  getLegalPlays,
  nextSeat,
  type SpadesBid,
  type SpadesPlayerView,
  type SpadesSeat,
  type SpadesTeam,
} from "@tabletop/game-spades";

interface SpadesTableProps {
  view: SpadesPlayerView;
  viewingSeat: SpadesSeat;
  concealHand?: boolean;
  interactionLocked?: boolean;
  onBlindNilChoice: (blindNil: boolean) => void;
  onBid: (bid: Exclude<SpadesBid, { kind: "blind-nil" }>) => void;
  onPlayCard: (cardId: string) => void;
}

type TablePosition = "bottom" | "left" | "top" | "right";

const SUIT_SYMBOL = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;
const SUIT_LABEL = { clubs: "Clubs", diamonds: "Diamonds", hearts: "Hearts", spades: "Spades" } as const;
const SUIT_ORDER = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 } as const;
const RANK_ORDER = {
  ace: 0,
  king: 1,
  queen: 2,
  jack: 3,
  "10": 4,
  "9": 5,
  "8": 6,
  "7": 7,
  "6": 8,
  "5": 9,
  "4": 10,
  "3": 11,
  "2": 12,
} as const;

const TEAM_SEATS: Record<SpadesTeam, readonly SpadesSeat[]> = {
  "north-south": ["north", "south"],
  "east-west": ["east", "west"],
};

export const RESOLVED_TRICK_DISPLAY_MS = 1500;

function sortHand(cards: readonly CardInstance[]): CardInstance[] {
  return [...cards].sort((left, right) => (
    SUIT_ORDER[left.suit] - SUIT_ORDER[right.suit]
    || RANK_ORDER[left.rank] - RANK_ORDER[right.rank]
  ));
}

function seatsFromViewer(viewingSeat: SpadesSeat): Record<TablePosition, SpadesSeat> {
  const left = nextSeat(viewingSeat);
  const top = nextSeat(left);
  const right = nextSeat(top);
  return { bottom: viewingSeat, left, top, right };
}

function bidLabel(bid: SpadesBid | undefined): string {
  if (!bid) return "—";
  if (bid.kind === "nil") return "Nil";
  if (bid.kind === "blind-nil") return "Blind Nil";
  return String(bid.tricks);
}

function teamBidLabel(view: SpadesPlayerView, team: SpadesTeam): string {
  const bids = TEAM_SEATS[team]
    .map((seat) => view.bids[seat])
    .filter((bid): bid is SpadesBid => Boolean(bid));
  const regular = bids.reduce(
    (total, bid) => total + (bid.kind === "normal" ? bid.tricks : 0),
    0,
  );
  const special = bids
    .filter((bid) => bid.kind !== "normal")
    .map((bid) => bid.kind === "blind-nil" ? "Blind Nil" : "Nil");
  if (bids.length === 0) return "—";
  return [regular > 0 ? String(regular) : "", ...special].filter(Boolean).join(" + ");
}

function teamTricks(view: SpadesPlayerView, team: SpadesTeam): number {
  return TEAM_SEATS[team].reduce((total, seat) => total + view.tricksWon[seat], 0);
}

function pendingBags(view: SpadesPlayerView, team: SpadesTeam): number {
  if (view.phase !== "playing") return 0;
  const contract = TEAM_SEATS[team].reduce((total, seat) => {
    const bid = view.bids[seat];
    return total + (bid?.kind === "normal" ? bid.tricks : 0);
  }, 0);
  return Math.max(0, teamTricks(view, team) - contract);
}

function teamNames(view: SpadesPlayerView, team: SpadesTeam): string {
  return TEAM_SEATS[team]
    .map((seat) => view.players.find((player) => player.seat === seat)?.name ?? seat)
    .join(" + ");
}

function teamPlayers(view: SpadesPlayerView, team: SpadesTeam) {
  return TEAM_SEATS[team].map((seat) => ({
    seat,
    player: view.players.find((candidate) => candidate.seat === seat),
  }));
}

function phaseStatus(view: SpadesPlayerView): string {
  const currentPlayer = view.players.find((player) => player.seat === view.currentSeat)?.name;
  if (view.phase === "blind-nil") return "Players are choosing whether to go blind nil";
  if (view.phase === "bidding") return currentPlayer ? `${currentPlayer} is bidding` : "Bidding";
  if (view.phase === "playing" && view.currentTrick.plays.length === 0) {
    return currentPlayer ? `${currentPlayer} leads` : "Waiting for the lead";
  }
  return "";
}

function rankLabel(card: CardInstance): string {
  if (card.rank === "ace") return "A";
  if (card.rank === "king") return "K";
  if (card.rank === "queen") return "Q";
  if (card.rank === "jack") return "J";
  return card.rank;
}

function PlayerSeat({ seat, view }: { seat: SpadesSeat; view: SpadesPlayerView }) {
  const player = view.players.find((candidate) => candidate.seat === seat);
  const isTurn = view.currentSeat === seat;
  return (
    <section
      aria-label={`${player?.name ?? seat} seat`}
      className={`rounded-xl border px-2 py-2 text-center shadow-sm sm:px-4 sm:py-3 ${
        isTurn
          ? "border-amber-300 bg-amber-950 ring-2 ring-amber-300/60"
          : "border-emerald-700 bg-emerald-950/85"
      }`}
    >
      <div className="truncate text-xs font-bold text-white sm:text-sm">
        {player?.name ?? seat}{player?.isBot ? ` · ${player.difficulty ?? "normal"}` : ""}
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-x-2 text-[11px] text-emerald-100 sm:text-xs">
        <span>{view.opponentHandCounts[seat]} cards</span>
        <span>Bid {bidLabel(view.bids[seat])}</span>
        <span>{view.tricksWon[seat]} tricks</span>
      </div>
    </section>
  );
}

function PlayingCard({ card, playable, onPlay }: {
  card: CardInstance;
  playable: boolean;
  onPlay: () => void;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <button
      type="button"
      aria-label={`${rankLabel(card)} of ${SUIT_LABEL[card.suit]}`}
      disabled={!playable}
      onClick={onPlay}
      className={`flex h-24 min-w-14 flex-col justify-between rounded-lg border bg-white p-2 text-left shadow-md transition sm:h-32 sm:min-w-20 sm:p-3 ${
        red ? "text-red-600" : "text-zinc-950"
      } ${playable ? "-translate-y-1 cursor-pointer ring-2 ring-amber-300 hover:-translate-y-3" : "opacity-85"}`}
    >
      <strong className="text-lg leading-none sm:text-2xl">{rankLabel(card)}</strong>
      <span className="self-center text-2xl sm:text-4xl" aria-hidden="true">{SUIT_SYMBOL[card.suit]}</span>
      <strong className="rotate-180 self-end text-lg leading-none sm:text-2xl">{rankLabel(card)}</strong>
    </button>
  );
}

function PhaseControls({
  view,
  viewingSeat,
  interactionLocked = false,
  onBlindNilChoice,
  onBid,
}: Omit<SpadesTableProps, "onPlayCard">) {
  if (view.phase === "blind-nil") {
    return (
      <div className="rounded-2xl bg-black/65 p-4 text-center text-white shadow-xl" aria-label="Blind nil choice">
        <h2 className="font-bold">Choose before viewing your hand</h2>
        <p className="mt-1 text-sm text-zinc-300">{view.blindNilChoicesMade} of 4 players locked</p>
        <div className="mt-3 flex justify-center gap-3">
          <button type="button" disabled={interactionLocked} onClick={() => onBlindNilChoice(true)} className="press rounded-cab bg-violet-600 px-4 py-3 font-semibold disabled:opacity-50">Blind Nil</button>
          <button type="button" disabled={interactionLocked} onClick={() => onBlindNilChoice(false)} className="press rounded-cab bg-emerald-600 px-4 py-3 font-semibold disabled:opacity-50">View Hand</button>
        </div>
      </div>
    );
  }

  if (view.phase === "bidding" && view.currentSeat === viewingSeat) {
    return (
      <div className="rounded-2xl bg-black/65 p-3 text-white shadow-xl" aria-label="Bid controls">
        <p className="mb-2 text-center text-sm font-semibold">Your bid</p>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          <button type="button" disabled={interactionLocked} onClick={() => onBid({ kind: "nil" })} className="press min-w-14 rounded-cab bg-violet-600 px-3 py-2 font-semibold disabled:opacity-50">Nil</button>
          {Array.from({ length: 13 }, (_, index) => index + 1).map((tricks) => (
            <button key={tricks} type="button" disabled={interactionLocked} onClick={() => onBid({ kind: "normal", tricks })} className="press min-w-10 rounded-cab bg-emerald-700 px-3 py-2 font-semibold disabled:opacity-50">{tricks}</button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export function SpadesTable(props: SpadesTableProps) {
  const { view, viewingSeat, concealHand = false, onPlayCard } = props;
  const seats = seatsFromViewer(viewingSeat);
  const legalIds = new Set(
    !concealHand && view.phase === "playing" && view.currentSeat === viewingSeat
      ? getLegalPlays(view.hand, view.currentTrick, view.spadesBroken).map((card) => card.id)
      : [],
  );
  const completedTricks = view.completedTricks ?? [];
  const latestTrickIndex = completedTricks.length - 1;
  const [reviewedTrickIndex, setReviewedTrickIndex] = useState<number | null>(null);
  const [olderReviewConfirmed, setOlderReviewConfirmed] = useState(false);
  const [dismissedResolutionKey, setDismissedResolutionKey] = useState<string | null>(null);
  const reviewedTrick = reviewedTrickIndex === null ? undefined : completedTricks[reviewedTrickIndex];
  const viewingPlayer = view.players.find((player) => player.seat === viewingSeat);
  const resolutionKey = (
    view.phase === "playing"
    && view.currentTrick.plays.length === 0
    && completedTricks.length > 0
  ) ? `${view.handNumber}:${completedTricks.length}` : null;
  const heldResolvedTrick = (
    resolutionKey
    && resolutionKey !== dismissedResolutionKey
  ) ? completedTricks[latestTrickIndex] : undefined;
  const displayedPlays = heldResolvedTrick?.plays ?? view.currentTrick.plays;
  const resolvedWinner = heldResolvedTrick
    ? view.players.find((player) => player.seat === heldResolvedTrick.winner)?.name ?? heldResolvedTrick.winner
    : null;

  useEffect(() => {
    if (!resolutionKey || resolutionKey === dismissedResolutionKey) return;
    const timer = window.setTimeout(() => {
      setDismissedResolutionKey(resolutionKey);
    }, RESOLVED_TRICK_DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [dismissedResolutionKey, resolutionKey]);

  const openLastWonTrick = () => {
    if (latestTrickIndex < 0) return;
    setOlderReviewConfirmed(false);
    setReviewedTrickIndex(latestTrickIndex);
  };

  const reviewOlderTrick = () => {
    if (reviewedTrickIndex === null || reviewedTrickIndex <= 0) return;
    if (
      reviewedTrickIndex === latestTrickIndex
      && !olderReviewConfirmed
      && !window.confirm("You are leaving the last won trick to review earlier tricks. Continue?")
    ) return;
    setOlderReviewConfirmed(true);
    setReviewedTrickIndex(reviewedTrickIndex - 1);
  };

  return (
    <main className="min-h-screen bg-emerald-950 px-2 py-3 text-white sm:px-6 sm:py-5">
      <header className="sticky top-0 z-30 mx-auto mb-3 max-w-6xl rounded-2xl border border-emerald-700 bg-emerald-950/95 p-3 text-sm shadow-xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black tracking-wide sm:text-2xl">Spades</h1>
            <p className="text-emerald-200">Hand {view.handNumber} · Playing to {view.targetScore}</p>
          </div>
          <button
            type="button"
            disabled={completedTricks.length === 0}
            onClick={openLastWonTrick}
            className="press rounded-cab border border-amber-300/70 px-3 py-2 font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Last won trick{completedTricks.length > 0 ? ` (${completedTricks.length})` : ""}
          </button>
        </div>

        <section aria-label="Live scoreboard" className="mt-3 grid grid-cols-2 gap-2">
          {([[
            "north-south", "N/S",
          ], [
            "east-west", "E/W",
          ]] as const).map(([team, seatLabel]) => (
            <div
              key={team}
              className={`rounded-xl border px-3 py-2 ${
                viewingPlayer?.team === team
                  ? "border-amber-300/70 bg-amber-950/40"
                  : "border-transparent bg-black/30"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-emerald-200 sm:text-xs">
                <span>{seatLabel === "N/S" ? "North / South" : "East / West"}</span>
                {viewingPlayer?.team === team && <span className="text-amber-200">Your team</span>}
              </div>

              <div className="mt-2 flex items-end justify-between gap-2 border-b border-emerald-700/60 pb-2">
                <strong className="min-w-0 truncate text-sm font-black text-white sm:text-lg">
                  {teamNames(view, team)}
                </strong>
                <strong className="text-2xl font-black leading-none text-white sm:text-3xl">
                  {view.scores[team].score}
                </strong>
              </div>

              <div className="mt-2 space-y-1 text-[11px] sm:text-xs">
                {teamPlayers(view, team).map(({ seat, player }) => (
                  <div key={seat} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-emerald-100">
                    <strong className="truncate text-left text-white">{player?.name ?? seat}</strong>
                    <span>Bid <strong className="text-white">{bidLabel(view.bids[seat])}</strong></span>
                    <span>Tricks <strong className="text-white">{view.tricksWon[seat]}</strong></span>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex justify-between border-t border-emerald-700/60 pt-2 text-[11px] text-emerald-100 sm:text-xs">
                <span>Team bid <strong className="text-white">{teamBidLabel(view, team)}</strong></span>
                <span>
                  Bags <strong className="text-white">
                    {view.scores[team].bags}{pendingBags(view, team) > 0 ? ` +${pendingBags(view, team)}` : ""}
                  </strong>
                </span>
              </div>
            </div>
          ))}
        </section>
      </header>

      <div className="mx-auto grid min-h-[48vh] max-w-6xl grid-cols-[minmax(4.5rem,0.7fr)_minmax(9rem,2fr)_minmax(4.5rem,0.7fr)] grid-rows-[auto_1fr] items-center gap-2 rounded-[2rem] border border-emerald-700 bg-emerald-900/70 p-2 shadow-inner sm:min-h-[40vh] sm:gap-5 sm:p-6">
        <div className="col-start-2 row-start-1"><PlayerSeat seat={seats.top} view={view} /></div>
        <div className="col-start-1 row-start-2"><PlayerSeat seat={seats.left} view={view} /></div>

        <section aria-label="Current trick" className="col-start-2 row-start-2 flex min-h-32 flex-col items-center justify-center rounded-2xl border border-emerald-700/60 bg-emerald-800/40 p-2 sm:min-h-56">
          <p className="mb-3 text-xs uppercase tracking-widest text-emerald-200">
            {resolvedWinner
              ? `${resolvedWinner} won trick ${completedTricks.length}`
              : view.phase === "playing"
                ? (view.spadesBroken ? "Spades broken" : "Spades unbroken")
                : view.phase.replace("-", " ")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {displayedPlays.map((play) => (
              <div
                key={play.card.id}
                aria-label={`${view.players.find((player) => player.seat === play.seat)?.name ?? play.seat} played ${rankLabel(play.card)} of ${SUIT_LABEL[play.card.suit]}`}
                className="min-w-20 rounded-lg bg-white px-3 py-2 text-center text-zinc-950 shadow"
              >
                <span className={play.card.suit === "hearts" || play.card.suit === "diamonds" ? "text-red-600" : ""}>
                  {rankLabel(play.card)} {SUIT_SYMBOL[play.card.suit]}
                </span>
                <strong className="mt-1 block max-w-24 truncate text-[11px] text-zinc-700">
                  {view.players.find((player) => player.seat === play.seat)?.name ?? play.seat}
                </strong>
                <small className="block text-[9px] uppercase tracking-wide text-zinc-400">{play.seat}</small>
              </div>
            ))}
            {displayedPlays.length === 0 && (
              <span className="text-sm text-emerald-300">{phaseStatus(view)}</span>
            )}
          </div>
          {!concealHand && (
            <div className="mt-4 w-full max-w-2xl">
              <PhaseControls {...props} />
            </div>
          )}
        </section>

        <div className="col-start-3 row-start-2"><PlayerSeat seat={seats.right} view={view} /></div>
      </div>

      {reviewedTrick && reviewedTrickIndex !== null && (
        <section role="dialog" aria-modal="true" aria-label="Trick review" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-emerald-600 bg-emerald-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                  {reviewedTrickIndex === latestTrickIndex ? "Last won trick" : "Earlier trick"}
                </p>
                <h2 className="mt-1 text-xl font-black">Trick {reviewedTrickIndex + 1} of {completedTricks.length}</h2>
                <p className="mt-1 text-sm text-emerald-100">
                  {view.players.find((player) => player.seat === reviewedTrick.winner)?.name ?? reviewedTrick.winner} won
                </p>
              </div>
              <button type="button" onClick={() => setReviewedTrickIndex(null)} className="press rounded-cab border border-emerald-600 px-3 py-2 font-semibold">Back to live</button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {reviewedTrick.plays.map((play) => (
                <div key={play.card.id} className="rounded-xl bg-white px-3 py-4 text-center text-zinc-950 shadow">
                  <strong className={`text-xl ${play.card.suit === "hearts" || play.card.suit === "diamonds" ? "text-red-600" : ""}`}>
                    {rankLabel(play.card)} {SUIT_SYMBOL[play.card.suit]}
                  </strong>
                  <small className="mt-2 block text-zinc-500">
                    {view.players.find((player) => player.seat === play.seat)?.name ?? play.seat}
                  </small>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" disabled={reviewedTrickIndex === 0} onClick={reviewOlderTrick} className="press rounded-cab bg-emerald-800 px-4 py-2 font-semibold disabled:opacity-40">Earlier trick</button>
              <button type="button" disabled={reviewedTrickIndex === latestTrickIndex} onClick={() => setReviewedTrickIndex(reviewedTrickIndex + 1)} className="press rounded-cab bg-emerald-800 px-4 py-2 font-semibold disabled:opacity-40">Newer trick</button>
            </div>
          </div>
        </section>
      )}

      {!concealHand && (
        <section aria-label="Your hand" data-position="bottom" className="sticky bottom-0 mx-auto -mt-2 max-w-6xl rounded-t-3xl border border-emerald-700 bg-emerald-950/95 px-2 pb-3 pt-3 backdrop-blur sm:static sm:mt-4 sm:rounded-3xl sm:p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <strong>{view.players.find((player) => player.seat === viewingSeat)?.name ?? "You"} · {viewingSeat}</strong>
            <span>Bid {bidLabel(view.bids[viewingSeat])} · {view.tricksWon[viewingSeat]} tricks</span>
          </div>
          {view.phase !== "blind-nil" && (
            <div className="mt-3 flex gap-1 overflow-x-auto px-1 pb-2 sm:justify-center sm:gap-2" data-testid="player-hand">
              {sortHand(view.hand).map((card) => (
                <PlayingCard key={card.id} card={card} playable={legalIds.has(card.id)} onPlay={() => onPlayCard(card.id)} />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
