'use client';

import { useState } from 'react';
import {
  getLegalPlays,
  nextSeat,
  type CardInstance,
  type SpadesBid,
  type SpadesPlayerView,
  type SpadesSeat,
  type SpadesTeam,
} from '@tabletop/shared';

interface SpadesTableProps {
  view: SpadesPlayerView;
  viewingSeat: SpadesSeat;
  concealHand?: boolean;
  onBlindNilChoice: (blindNil: boolean) => void;
  onBid: (bid: Exclude<SpadesBid, { kind: 'blind-nil' }>) => void;
  onPlayCard: (cardId: string) => void;
}

type TablePosition = 'bottom' | 'left' | 'top' | 'right';

const SUIT_SYMBOL = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' } as const;
const SUIT_LABEL = { clubs: 'Clubs', diamonds: 'Diamonds', hearts: 'Hearts', spades: 'Spades' } as const;
const SUIT_ORDER = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 } as const;
const RANK_ORDER = {
  ace: 0, king: 1, queen: 2, jack: 3, '10': 4, '9': 5, '8': 6,
  '7': 7, '6': 8, '5': 9, '4': 10, '3': 11, '2': 12,
} as const;

const TEAM_SEATS: Record<SpadesTeam, readonly SpadesSeat[]> = {
  'north-south': ['north', 'south'],
  'east-west': ['east', 'west'],
};

function teamBidLabel(view: SpadesPlayerView, team: SpadesTeam): string {
  const bids = TEAM_SEATS[team]
    .map((seat) => view.bids[seat])
    .filter((bid): bid is SpadesBid => Boolean(bid));
  const normalBid = bids.reduce(
    (total, bid) => total + (bid.kind === 'normal' ? bid.tricks : 0),
    0,
  );
  const specialBids = bids
    .filter((bid) => bid.kind !== 'normal')
    .map((bid) => bid.kind === 'blind-nil' ? 'Blind Nil' : 'Nil');
  if (bids.length === 0) return '—';
  return [normalBid > 0 ? String(normalBid) : '', ...specialBids]
    .filter(Boolean)
    .join(' + ');
}

function teamTricks(view: SpadesPlayerView, team: SpadesTeam): number {
  return TEAM_SEATS[team].reduce((total, seat) => total + view.tricksWon[seat], 0);
}

function pendingBags(view: SpadesPlayerView, team: SpadesTeam): number {
  if (view.phase !== 'playing') return 0;
  const contract = TEAM_SEATS[team].reduce((total, seat) => {
    const bid = view.bids[seat];
    return total + (bid?.kind === 'normal' ? bid.tricks : 0);
  }, 0);
  return Math.max(0, teamTricks(view, team) - contract);
}

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
  if (!bid) return '—';
  if (bid.kind === 'nil') return 'Nil';
  if (bid.kind === 'blind-nil') return 'Blind Nil';
  return String(bid.tricks);
}

function rankLabel(card: CardInstance): string {
  if (card.rank === 'ace') return 'A';
  if (card.rank === 'king') return 'K';
  if (card.rank === 'queen') return 'Q';
  if (card.rank === 'jack') return 'J';
  return card.rank;
}

function PlayerSeat({
  position,
  seat,
  view,
}: {
  position: Exclude<TablePosition, 'bottom'>;
  seat: SpadesSeat;
  view: SpadesPlayerView;
}) {
  const player = view.players.find((candidate) => candidate.seat === seat);
  const isTurn = view.currentSeat === seat;
  const count = view.opponentHandCounts[seat];

  return (
    <section
      aria-label={`${player?.name ?? seat} seat`}
      data-position={position}
      className={`rounded-xl border px-2 py-2 text-center shadow-sm sm:px-4 sm:py-3 ${
        isTurn
          ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-300/60 dark:bg-amber-950/40'
          : 'border-emerald-800/60 bg-emerald-950/80'
      }`}
    >
      <div className="truncate text-xs font-bold text-white sm:text-sm">
        {player?.name ?? seat}
        {player?.isBot ? ` · ${player.difficulty ?? 'normal'}` : ''}
      </div>
      <div className="mt-1 flex justify-center gap-2 text-[11px] text-emerald-100 sm:text-xs">
        <span>{count} cards</span>
        <span>Bid {bidLabel(view.bids[seat])}</span>
        <span>{view.tricksWon[seat]} tricks</span>
      </div>
    </section>
  );
}

function PlayingCard({
  card,
  playable,
  onPlay,
}: {
  card: CardInstance;
  playable: boolean;
  onPlay: () => void;
}) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <button
      type="button"
      aria-label={`${rankLabel(card)} of ${SUIT_LABEL[card.suit]}`}
      disabled={!playable}
      onClick={onPlay}
      className={`flex h-24 min-w-14 flex-col justify-between rounded-lg border bg-white p-2 text-left shadow-md transition sm:h-32 sm:min-w-20 sm:p-3 ${
        red ? 'text-red-600' : 'text-zinc-950'
      } ${playable ? '-translate-y-1 cursor-pointer ring-2 ring-amber-300 hover:-translate-y-3' : 'opacity-90'}`}
    >
      <strong className="text-lg leading-none sm:text-2xl">{rankLabel(card)}</strong>
      <span className="self-center text-2xl sm:text-4xl" aria-hidden="true">{SUIT_SYMBOL[card.suit]}</span>
      <strong className="rotate-180 self-end text-lg leading-none sm:text-2xl">{rankLabel(card)}</strong>
    </button>
  );
}

function PhaseControls({ view, viewingSeat, onBlindNilChoice, onBid }: Omit<SpadesTableProps, 'onPlayCard'>) {
  if (view.phase === 'blind-nil') {
    return (
      <div className="rounded-2xl bg-zinc-950/90 p-4 text-center text-white shadow-xl" aria-label="Blind nil choice">
        <h2 className="font-bold">Choose before viewing your hand</h2>
        <p className="mt-1 text-sm text-zinc-300">{view.blindNilChoicesMade} of 4 players locked</p>
        <div className="mt-3 flex justify-center gap-3">
          <button type="button" onClick={() => onBlindNilChoice(true)} className="rounded-lg bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">Blind Nil</button>
          <button type="button" onClick={() => onBlindNilChoice(false)} className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold hover:bg-emerald-500">View Hand</button>
        </div>
      </div>
    );
  }

  if (view.phase === 'bidding' && view.currentSeat === viewingSeat) {
    return (
      <div className="rounded-2xl bg-zinc-950/90 p-3 text-white shadow-xl" aria-label="Bid controls">
        <p className="mb-2 text-center text-sm font-semibold">Your bid</p>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => onBid({ kind: 'nil' })} className="min-w-14 rounded-lg bg-violet-600 px-3 py-2 font-semibold">Nil</button>
          {Array.from({ length: 13 }, (_, index) => index + 1).map((tricks) => (
            <button key={tricks} type="button" onClick={() => onBid({ kind: 'normal', tricks })} className="min-w-10 rounded-lg bg-emerald-700 px-3 py-2 font-semibold">{tricks}</button>
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
    !concealHand && view.phase === 'playing' && view.currentSeat === viewingSeat
      ? getLegalPlays(view.hand, view.currentTrick, view.spadesBroken).map((card) => card.id)
      : [],
  );
  const sortedHand = sortHand(view.hand);
  const completedTricks = view.completedTricks ?? [];
  const [reviewedTrickIndex, setReviewedTrickIndex] = useState<number | null>(null);
  const [olderReviewConfirmed, setOlderReviewConfirmed] = useState(false);
  const latestTrickIndex = completedTricks.length - 1;
  const reviewedTrick = reviewedTrickIndex === null
    ? undefined
    : completedTricks[reviewedTrickIndex];

  const openLastWonTrick = () => {
    if (latestTrickIndex < 0) return;
    setOlderReviewConfirmed(false);
    setReviewedTrickIndex(latestTrickIndex);
  };

  const closeTrickReview = () => {
    setOlderReviewConfirmed(false);
    setReviewedTrickIndex(null);
  };

  const reviewOlderTrick = () => {
    if (reviewedTrickIndex === null || reviewedTrickIndex <= 0) return;
    if (
      reviewedTrickIndex === latestTrickIndex
      && !olderReviewConfirmed
      && !window.confirm(
        'You are leaving the last won trick to review earlier tricks. Continue?',
      )
    ) {
      return;
    }
    setOlderReviewConfirmed(true);
    setReviewedTrickIndex(reviewedTrickIndex - 1);
  };

  return (
    <main className="min-h-screen bg-emerald-950 px-2 py-3 text-white sm:px-6 sm:py-5">
      <header className="sticky top-0 z-30 mx-auto mb-3 max-w-6xl rounded-2xl border border-emerald-800 bg-emerald-950/95 p-3 text-sm shadow-xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black tracking-wide sm:text-2xl">Spades</h1>
            <p className="text-emerald-200">Hand {view.handNumber} · Playing to {view.targetScore}</p>
          </div>
          <button
            type="button"
            disabled={completedTricks.length === 0}
            onClick={openLastWonTrick}
            className="rounded-lg border border-amber-300/70 px-3 py-2 font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Last won trick{completedTricks.length > 0 ? ` (${completedTricks.length})` : ''}
          </button>
        </div>
        <section aria-label="Live scoreboard" className="mt-3 grid grid-cols-2 gap-2">
          {([
            ['north-south', 'N/S'],
            ['east-west', 'E/W'],
          ] as const).map(([team, label]) => {
            const currentPendingBags = pendingBags(view, team);
            return (
              <div key={team} className="rounded-xl bg-black/30 px-3 py-2">
                <div className="flex items-center justify-between">
                  <strong>{label}</strong>
                  <strong className="text-lg">{view.scores[team].score}</strong>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[11px] text-emerald-100 sm:text-xs">
                  <span><strong className="block text-white">{teamBidLabel(view, team)}</strong>Bid</span>
                  <span><strong className="block text-white">{teamTricks(view, team)}</strong>Tricks</span>
                  <span>
                    <strong className="block text-white">
                      {view.scores[team].bags}
                      {currentPendingBags > 0 ? ` +${currentPendingBags}` : ''}
                    </strong>
                    Bags
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      </header>

      <div className="mx-auto grid min-h-[55vh] max-w-6xl grid-cols-[minmax(4.5rem,0.7fr)_minmax(9rem,2fr)_minmax(4.5rem,0.7fr)] grid-rows-[auto_1fr] items-center gap-2 rounded-[2rem] border border-emerald-700/70 bg-emerald-900/70 p-2 shadow-inner sm:min-h-[62vh] sm:gap-5 sm:p-6">
        <div className="col-start-2 row-start-1"><PlayerSeat position="top" seat={seats.top} view={view} /></div>
        <div className="col-start-1 row-start-2"><PlayerSeat position="left" seat={seats.left} view={view} /></div>

        <section aria-label="Current trick" className="col-start-2 row-start-2 flex min-h-32 flex-col items-center justify-center rounded-2xl border border-emerald-700/60 bg-emerald-800/40 p-2 sm:min-h-56">
          <p className="mb-3 text-xs uppercase tracking-widest text-emerald-200">
            {view.phase === 'playing' ? (view.spadesBroken ? 'Spades broken' : 'Spades unbroken') : view.phase.replace('-', ' ')}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {view.currentTrick.plays.map((play) => (
              <div key={play.card.id} className="rounded-lg bg-white px-3 py-2 text-center text-zinc-950 shadow">
                <span className={play.card.suit === 'hearts' || play.card.suit === 'diamonds' ? 'text-red-600' : ''}>{rankLabel(play.card)} {SUIT_SYMBOL[play.card.suit]}</span>
                <small className="block text-[10px] uppercase text-zinc-500">{play.seat}</small>
              </div>
            ))}
            {view.currentTrick.plays.length === 0 && <span className="text-sm text-emerald-300">Waiting for the lead</span>}
          </div>
        </section>

        <div className="col-start-3 row-start-2"><PlayerSeat position="right" seat={seats.right} view={view} /></div>
      </div>

      {reviewedTrick && reviewedTrickIndex !== null && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Trick review"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-lg rounded-3xl border border-emerald-600 bg-emerald-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-300">
                  {reviewedTrickIndex === latestTrickIndex
                    ? 'Last won trick'
                    : 'Earlier trick'}
                </p>
                <h2 className="mt-1 text-xl font-black">
                  Trick {reviewedTrickIndex + 1} of {completedTricks.length}
                </h2>
                <p className="mt-1 text-sm text-emerald-100">
                  {view.players.find((player) => player.seat === reviewedTrick.winner)?.name
                    ?? reviewedTrick.winner} won
                </p>
              </div>
              <button
                type="button"
                onClick={closeTrickReview}
                className="rounded-lg border border-emerald-600 px-3 py-2 font-semibold"
              >
                Back to live
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {reviewedTrick.plays.map((play) => (
                <div key={play.card.id} className="rounded-xl bg-white px-3 py-4 text-center text-zinc-950 shadow">
                  <strong className={`text-xl ${
                    play.card.suit === 'hearts' || play.card.suit === 'diamonds'
                      ? 'text-red-600'
                      : ''
                  }`}>
                    {rankLabel(play.card)} {SUIT_SYMBOL[play.card.suit]}
                  </strong>
                  <small className="mt-2 block text-zinc-500">
                    {view.players.find((player) => player.seat === play.seat)?.name ?? play.seat}
                  </small>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={reviewedTrickIndex === 0}
                onClick={reviewOlderTrick}
                className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold disabled:opacity-40"
              >
                Earlier trick
              </button>
              <button
                type="button"
                disabled={reviewedTrickIndex === latestTrickIndex}
                onClick={() => setReviewedTrickIndex(reviewedTrickIndex + 1)}
                className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold disabled:opacity-40"
              >
                Newer trick
              </button>
            </div>
          </div>
        </section>
      )}

      {!concealHand && <section aria-label="Your hand" data-position="bottom" className="sticky bottom-0 mx-auto -mt-2 max-w-6xl rounded-t-3xl border border-emerald-700 bg-emerald-950/95 px-2 pb-3 pt-3 backdrop-blur sm:static sm:mt-4 sm:rounded-3xl sm:p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <strong>{view.players.find((player) => player.seat === viewingSeat)?.name ?? 'You'} · {viewingSeat}</strong>
          <span>Bid {bidLabel(view.bids[viewingSeat])} · {view.tricksWon[viewingSeat]} tricks</span>
        </div>
        <PhaseControls {...props} />
        {view.phase !== 'blind-nil' && (
          <div className="mt-3 flex gap-1 overflow-x-auto px-1 pb-2 sm:justify-center sm:gap-2" data-testid="player-hand">
            {sortedHand.map((card) => (
              <PlayingCard key={card.id} card={card} playable={legalIds.has(card.id)} onPlay={() => onPlayCard(card.id)} />
            ))}
          </div>
        )}
      </section>}
    </main>
  );
}
