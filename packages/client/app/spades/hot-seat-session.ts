import {
  SPADES_SEATS,
  buildSpadesPlayerView,
  playCard,
  runBotTurns,
  startSpadesGame,
  submitBid,
  submitBlindNilChoice,
  type BotTurnRunnerOptions,
  type SpadesBid,
  type SpadesGameState,
  type SpadesPlayerView,
  type SpadesSeat,
  type StartSpadesGameOptions,
} from "@tabletop/game-spades";

export interface HotSeatSession {
  readonly state: SpadesGameState;
  readonly activeHumanSeat: SpadesSeat | null;
  readonly confirmedSeat: SpadesSeat | null;
}

function humanAt(state: SpadesGameState, seat: SpadesSeat) {
  return state.players.find((player) => player.seat === seat && !player.isBot);
}

function nextHumanInput(state: SpadesGameState): SpadesSeat | null {
  if (state.phase === "blind-nil") {
    return SPADES_SEATS.find(
      (seat) => humanAt(state, seat) && state.blindNilChoices[seat] === undefined,
    ) ?? null;
  }

  if ((state.phase === "bidding" || state.phase === "playing") && state.currentSeat) {
    return humanAt(state, state.currentSeat) ? state.currentSeat : null;
  }

  return null;
}

async function settleBots(
  state: SpadesGameState,
  botOptions: BotTurnRunnerOptions,
  showInitialState = false,
): Promise<HotSeatSession> {
  if (showInitialState) {
    await botOptions.onState?.(state);
  }
  const settled = await runBotTurns(state, botOptions);
  const activeHumanSeat = nextHumanInput(settled);
  const humanCount = settled.players.filter((player) => !player.isBot).length;
  return {
    state: settled,
    activeHumanSeat,
    // A solo player never needs to pass the device back to themselves.
    confirmedSeat: humanCount === 1 ? activeHumanSeat : null,
  };
}

export async function createHotSeatSession(
  options: StartSpadesGameOptions,
  botOptions: BotTurnRunnerOptions = {},
): Promise<HotSeatSession> {
  if (options.humans.length < 1) {
    throw new RangeError("hot seat requires at least one human");
  }
  return settleBots(startSpadesGame(options), botOptions);
}

export function confirmHotSeat(session: HotSeatSession, seat: SpadesSeat): HotSeatSession {
  if (session.activeHumanSeat !== seat) {
    throw new Error("this seat is not awaiting input");
  }
  return { ...session, confirmedSeat: seat };
}

export function buildHotSeatView(session: HotSeatSession): SpadesPlayerView | null {
  const seat = session.activeHumanSeat;
  if (!seat) return null;
  const view = buildSpadesPlayerView(session.state, seat);
  return session.confirmedSeat === seat ? view : { ...view, hand: [] };
}

function requireConfirmedSeat(session: HotSeatSession): SpadesSeat {
  if (!session.activeHumanSeat || session.confirmedSeat !== session.activeHumanSeat) {
    throw new Error("confirm the active player before acting");
  }
  return session.activeHumanSeat;
}

export async function hotSeatBlindNil(
  session: HotSeatSession,
  blindNil: boolean,
  botOptions: BotTurnRunnerOptions = {},
): Promise<HotSeatSession> {
  const seat = requireConfirmedSeat(session);
  return settleBots(submitBlindNilChoice(session.state, seat, blindNil), botOptions, true);
}

export async function hotSeatBid(
  session: HotSeatSession,
  bid: Exclude<SpadesBid, { kind: "blind-nil" }>,
  botOptions: BotTurnRunnerOptions = {},
): Promise<HotSeatSession> {
  const seat = requireConfirmedSeat(session);
  return settleBots(submitBid(session.state, seat, bid), botOptions, true);
}

export async function hotSeatPlay(
  session: HotSeatSession,
  cardId: string,
  botOptions: BotTurnRunnerOptions = {},
): Promise<HotSeatSession> {
  const seat = requireConfirmedSeat(session);
  return settleBots(playCard(session.state, seat, cardId, botOptions.random), botOptions, true);
}
