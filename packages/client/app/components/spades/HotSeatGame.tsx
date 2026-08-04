'use client';

import { useState } from 'react';
import type { BotTurnRunnerOptions, SpadesSeat } from '@tabletop/shared';
import {
  buildHotSeatView,
  confirmHotSeat,
  hotSeatBid,
  hotSeatBlindNil,
  hotSeatPlay,
  type HotSeatSession,
} from '../../spades/hot-seat-session';
import { SpadesTable } from './SpadesTable';

interface HotSeatGameProps {
  initialSession: HotSeatSession;
  botOptions?: BotTurnRunnerOptions;
}

export function HotSeatGame({ initialSession, botOptions = {} }: HotSeatGameProps) {
  const [session, setSession] = useState(initialSession);
  const [busy, setBusy] = useState(false);
  const activeSeat = session.activeHumanSeat;
  const activePlayer = session.state.players.find((player) => player.seat === activeSeat);
  const view = buildHotSeatView(session);

  const update = async (action: () => Promise<HotSeatSession>) => {
    if (busy) return;
    setBusy(true);
    try {
      setSession(await action());
    } finally {
      setBusy(false);
    }
  };

  if (session.state.phase === 'finished') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-950 p-6 text-white">
        <div className="rounded-2xl bg-black/30 p-8 text-center">
          <h1 className="text-3xl font-black">Game Over</h1>
          <p className="mt-3 text-lg">{session.state.winner === 'north-south' ? 'North / South' : 'East / West'} wins</p>
        </div>
      </main>
    );
  }

  if (!activeSeat || !view) {
    return <div className="min-h-screen bg-emerald-950 p-8 text-center text-white">Computer players are thinking…</div>;
  }

  if (session.confirmedSeat !== activeSeat) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-950 p-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-emerald-700 bg-emerald-900 p-8 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-widest text-emerald-200">Pass the device</p>
          <h1 className="mt-3 text-3xl font-black">{activePlayer?.name ?? activeSeat}</h1>
          <p className="mt-3 text-emerald-100">Other players should look away before this seat continues.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSession(confirmHotSeat(session, activeSeat as SpadesSeat))}
            className="mt-6 rounded-xl bg-amber-400 px-6 py-3 font-bold text-zinc-950 hover:bg-amber-300"
          >
            I am {activePlayer?.name ?? activeSeat}
          </button>
        </section>
      </main>
    );
  }

  return (
    <div aria-busy={busy}>
      <SpadesTable
        view={view}
        viewingSeat={activeSeat}
        onBlindNilChoice={(blindNil) => void update(() => hotSeatBlindNil(session, blindNil, botOptions))}
        onBid={(bid) => void update(() => hotSeatBid(session, bid, botOptions))}
        onPlayCard={(cardId) => void update(() => hotSeatPlay(session, cardId, botOptions))}
      />
    </div>
  );
}
