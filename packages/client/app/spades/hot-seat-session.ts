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
} from '@tabletop/shared';

export interface HotSeatSession {
  readonly state: SpadesGameState;
  readonly activeHumanSeat: SpadesSeat | null;
  readonly confirmedSeat: SpadesSeat | null;
}

function humanAt(state: SpadesGameState, seat: SpadesSeat) {
  return state.players.find((player) => player.seat === seat && !player.isBot);
}

function nextHumanInput(state: SpadesGameState): SpadesSeat | null {
  if (state.phase === 'blind-nil') {
    return SPADES_SEATS.find((seat) => (
      humanAt(state, seat) && state.blindNilChoices[seat] === undefined
    )) ?? null;
  }
  if ((state.phase === 'bidding' || state.phase === 'playing') && state.currentSeat) {
    return humanAt(state, state.currentSeat) ? state.currentSeat : null;
  }
  return null;
}

async function settleBots(
  state: SpadesGameState,
  botOptions: BotTurnRunnerOptions,
): Promise<HotSeatSession> {
  const settled = await runBotTurns(state, botOptions);
  return {
    state: settled,
    activeHumanSeat: nextHumanInput(settled),
    confirmedSeat: null,
  };
}

export async function createHotSeatSession(
  options: StartSpadesGameOptions,
  botOptions: BotTurnRunnerOptions = {},
): Promise<HotSeatSession> {
  if (options.humans.length < 1) throw new RangeError('hot seat requires at least one human');
  return settleBots(startSpadesGame(options), botOptions);
}

export function confirmHotSeat(session: HotSeatSession, seat: SpadesSeat): HotSeatSession {
  if (session.activeHumanSeat !== seat) throw new Error('this seat is not awaiting input');
  return { ...session, confirmedSeat: seat };
}

export function buildHotSeatView(session: HotSeatSession): SpadesPlayerView | null {
  const seat = session.activeHumanSeat;
  if (!seat) return null;
  const view = buildSpadesPlayerView(session.state, seat);
  if (session.confirmedSeat === seat) return view;
  return { ...view, hand: [] };
}

function requireConfirmedSeat(session: HotSeatSession): SpadesSeat {
  if (!session.activeHumanSeat || session.confirmedSeat !== session.activeHumanSeat) {
    throw new Error('confirm the active player before acting');
  }
  return session.activeHumanSeat;
}

export async function hotSeatBlindNil(
  session: HotSeatSession,
  blindNil: boolean,
  botOptions: BotTurnRunnerOptions = {},
): Promise<HotSeatSession> {
  const seat = requireConfirmedSeat(session);
  return settleBots(submitBlindNilChoice(session.state, seat, blindNil), botOptions);
}

export async function hotSeatBid(
  session: HotSeatSession,
  bid: Exclude<SpadesBid, { kind: 'blind-nil' }>,
  botOptions: BotTurnRunnerOptions = {},
): Promise<HotSeatSession> {
  const seat = requireConfirmedSeat(session);
  return settleBots(submitBid(session.state, seat, bid), botOptions);
}

export async function hotSeatPlay(
  session: HotSeatSession,
  cardId: string,
  botOptions: BotTurnRunnerOptions = {},
): Promise<HotSeatSession> {
  const seat = requireConfirmedSeat(session);
  return settleBots(playCard(session.state, seat, cardId, botOptions.random), botOptions);
}
