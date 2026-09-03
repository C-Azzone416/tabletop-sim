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
      <div className="relative min-h-screen bg-emerald-950">
        <SpadesTable
          view={view}
          viewingSeat={activeSeat}
          concealHand
          onBlindNilChoice={() => undefined}
          onBid={() => undefined}
          onPlayCard={() => undefined}
        />
        <section aria-label="Pass the device" className="fixed inset-x-3 bottom-4 z-10 mx-auto w-auto max-w-md rounded-3xl border border-emerald-600 bg-emerald-950/95 p-5 text-center text-white shadow-2xl backdrop-blur sm:bottom-8 sm:p-6">
          <p className="text-sm uppercase tracking-widest text-emerald-200">Pass the device</p>
          <h1 className="mt-2 text-2xl font-black">{activePlayer?.name ?? activeSeat}</h1>
          <p className="mt-2 text-sm text-emerald-100">The table stays visible. Other players should look away before the hand is revealed.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSession(confirmHotSeat(session, activeSeat as SpadesSeat))}
            className="mt-6 rounded-xl bg-amber-400 px-6 py-3 font-bold text-zinc-950 hover:bg-amber-300"
          >
            I am {activePlayer?.name ?? activeSeat}
          </button>
        </section>
      </div>
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
