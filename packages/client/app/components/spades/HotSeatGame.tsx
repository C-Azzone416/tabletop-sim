"use client";

import Link from "next/link";
import { useState } from "react";
import type { BotTurnRunnerOptions, SpadesSeat } from "@tabletop/game-spades";
import {
  buildHotSeatView,
  confirmHotSeat,
  hotSeatContinueHand,
  hotSeatBid,
  hotSeatBlindNil,
  hotSeatPlay,
  type HotSeatSession,
} from "../../spades/hot-seat-session";
import { SpadesTable } from "./SpadesTable";

interface HotSeatGameProps {
  initialSession: HotSeatSession;
  botOptions?: BotTurnRunnerOptions;
}

export function HotSeatGame({ initialSession, botOptions = {} }: HotSeatGameProps) {
  const [session, setSession] = useState(initialSession);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const activeSeat = session.activeHumanSeat;
  const activePlayer = session.state.players.find((player) => player.seat === activeSeat);
  const view = buildHotSeatView(session);

  const update = async (action: (progressOptions: BotTurnRunnerOptions) => Promise<HotSeatSession>) => {
    if (busy) return;
    const checkpoint = session;
    setBusy(true);
    setActionError(null);
    try {
      const viewerSeat = session.activeHumanSeat;
      const progressOptions: BotTurnRunnerOptions = {
        ...botOptions,
        onState: async (state) => {
          // Render the human move immediately, then every bot move as it happens.
          // Keep the same viewer during bot turns so a solo player's hand stays visible.
          setSession({
            state,
            activeHumanSeat: viewerSeat,
            confirmedSeat: viewerSeat,
          });
          await botOptions.onState?.(state);
        },
      };
      setSession(await action(progressOptions));
    } catch (error) {
      console.error("Hot-seat Spades action failed", error);
      // Bot progress is rendered incrementally. Roll back the whole action so
      // a partial bot sequence never leaves the table in an unplayable state.
      setSession(checkpoint);
      setActionError("That turn couldn’t be completed. The table was restored—please try again.");
    } finally {
      setBusy(false);
    }
  };

  const errorBanner = actionError ? (
    <div role="alert" className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-xl items-center justify-between gap-4 rounded-cab border-2 border-red-300 bg-red-950 p-4 text-sm font-semibold text-white shadow-xl">
      <span>{actionError}</span>
      <button type="button" onClick={() => setActionError(null)} className="press min-h-11 shrink-0 px-3">Dismiss</button>
    </div>
  ) : null;

  if (session.state.phase === "finished") {
    const winningTeam = session.state.winner === "north-south" ? "North / South" : "East / West";
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-950 p-6 text-white">
        {errorBanner}
        <section className="rounded-cab border-2 border-emerald-700 bg-black/30 p-8 text-center shadow-print-md">
          <h1 className="text-display-l-sm font-display">Game over</h1>
          <p className="mt-3 text-heading">{winningTeam} wins</p>
          <Link className="press mt-6 inline-block rounded-cab bg-white px-5 py-3 font-bold text-emerald-950" href="/play">
            Back to Play
          </Link>
        </section>
      </main>
    );
  }

  if (!activeSeat || !view) {
    return (
      <main className="min-h-screen bg-emerald-950 p-8 text-center text-white">
        {errorBanner}
        Computer players are thinking…
      </main>
    );
  }

  if (session.confirmedSeat !== activeSeat) {
    return (
      <div className="relative min-h-screen bg-emerald-950">
        {errorBanner}
        <SpadesTable
          view={view}
          viewingSeat={activeSeat}
          concealHand
          onBlindNilChoice={() => undefined}
          onBid={() => undefined}
          onPlayCard={() => undefined}
          onContinueHand={() => undefined}
        />
        <section
          aria-label="Pass the device"
          className="fixed inset-x-3 bottom-4 z-40 mx-auto w-auto max-w-md rounded-3xl border-2 border-emerald-500 bg-emerald-950/95 p-5 text-center text-white shadow-2xl backdrop-blur sm:bottom-8 sm:p-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">Pass the device</p>
          <h1 className="mt-2 text-2xl font-black">{activePlayer?.name ?? activeSeat}</h1>
          <p className="mt-2 text-sm text-emerald-100">
            The table stays visible. Other players should look away before this hand is revealed.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSession(confirmHotSeat(session, activeSeat as SpadesSeat))}
            className="press mt-6 rounded-cab bg-amber-300 px-6 py-3 font-bold text-zinc-950 disabled:opacity-50"
          >
            I am {activePlayer?.name ?? activeSeat}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div aria-busy={busy}>
      {errorBanner}
      <SpadesTable
        view={view}
        viewingSeat={activeSeat}
        interactionLocked={busy}
        onBlindNilChoice={(blindNil) => void update((options) => hotSeatBlindNil(session, blindNil, options))}
        onBid={(bid) => void update((options) => hotSeatBid(session, bid, options))}
        onPlayCard={(cardId) => void update((options) => hotSeatPlay(session, cardId, options))}
        onContinueHand={() => void update((options) => hotSeatContinueHand(session, options))}
      />
    </div>
  );
}
