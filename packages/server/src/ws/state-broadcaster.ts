import type { Game, Wire, ServerMessage } from '@tabletop/shared';
import type { FlipGameState } from '@tabletop/game-flip';
import * as wiresDb from '../db/wires.js';
import * as tokensDb from '../db/tokens.js';
import * as candidatesDb from '../db/candidates.js';
import * as flipGamesDb from '../db/flip-games.js';
import * as spadesGamesDb from '../db/spades-games.js';
import * as playersDb from '../db/players.js';
import * as gamesDb from '../db/games.js';
import { groupRoundsByPlayer, toFlipTableView } from './flip-view.js';
import { getGameSockets, getLobbyConfig, sendToPlayer } from './connection-manager.js';
import { flipTimeoutAction, executeFlipAction } from './flip-actions.js';
import { scheduleFlipTurnTimeout, cancelFlipTurnTimeout, turnDeadlineFor, clearTurnDeadline } from './flip-turn-timer.js';
import { FLIP_TURN_TIMEOUT_MS, FLIP_DEV_TURN_TIMEOUT_MS } from './message-handler.js';
import { broadcastPrivateSpadesState } from '../spades/spades-room-service.js';

/**
 * #394 (Contract C4) — fires when a Flip turn/pending-action's timer
 * (scheduleFlipTurnTimeout, armed by broadcastFlipGameState) elapses with
 * nobody having acted. Re-derives the action from freshly-loaded state
 * (never from anything captured when the timer was armed) and runs it
 * through the EXACT SAME executeFlipAction path a real player's click
 * does — same authorization, same persistence, same broadcast at the end —
 * so there is no separate "auto-action" code path that could authorize or
 * behave differently than a manual one.
 *
 * If the state changed between the timer being armed and this firing (a
 * manual action landed first, or the round otherwise moved on),
 * flipTimeoutAction reads the FRESH state and simply returns null / a
 * now-irrelevant action that executeFlipAction's own authorization refuses
 * — either way this is a no-op rather than a misfire, because it never
 * trusts anything about the state other than what it reads right now.
 */
async function fireFlipTurnTimeout(gameId: string): Promise<void> {
  const stored = await flipGamesDb.getFlipGameState(gameId);
  if (!stored) return;
  const state = stored as FlipGameState;

  const action = flipTimeoutAction(state);
  if (!action || state.turnPlayerId === null) return;

  try {
    await executeFlipAction(gameId, state.turnPlayerId, action);
  } catch {
    // Stale by the time this ran (a manual action already resolved it, or
    // the round ended) — executeFlipAction's own authorization/engine
    // guards correctly refused it. Nothing to recover: the next real
    // broadcast already reflects whatever actually happened.
    return;
  }

  const game = await gamesDb.getGameById(gameId);
  if (!game) return;
  await broadcastGameState(gameId, game);
}

/**
 * #382 — the Flip table, rebuilt from the persisted state blob on every
 * broadcast. Nothing is held in memory, which is what makes reconnect work:
 * a client rejoining mid-round gets the exact table, including an outstanding
 * Flip 3 and any pending Freeze/Flip 3 target choice.
 *
 * Identical for every player. Flip has no hidden state (#358 — design contract
 * C1 does not apply), so there is no buildPlayerView equivalent here;
 * `localPlayerId` tells a client which seat is theirs, never what they may see.
 */
async function broadcastFlipGameState(
  gameId: string,
  game: Game,
): Promise<void> {
  // #445 — queried fresh here, not passed in by the caller. Every caller
  // used to hand this function whatever `players` snapshot it happened to
  // have computed earlier in its own flow; when two joins (or a join and a
  // leave) overlapped, the caller whose full async chain finished LAST won
  // the broadcast to every client, even if its snapshot was the older one —
  // the classic "reconcile, don't broadcast-and-hope" bug (#445). Querying
  // at send time means the broadcast that goes out last is also the one
  // guaranteed to be current, so a client that missed or was overwritten by
  // a stale message self-corrects on the very next broadcast instead of
  // staying wrong indefinitely.
  const players = await playersDb.getPlayersByGameId(gameId);
  const stored = await flipGamesDb.getFlipGameState(gameId);
  const state = stored as FlipGameState | null;

  // #394 (Contract C4) recomputed on every broadcast — but #394 REVIEW
  // (weasel/QA) is the reason for the shape below. Re-arming the setTimeout
  // CALLBACK on every broadcast is correct and necessary: it's what makes
  // the guarantee reach a client that isn't watching (a disconnected
  // player, or one who never sees this exact message). But every broadcast
  // — including a reconnect, which any seated player can trigger for free
  // and repeatedly by cycling their own WebSocket — used to also ADVANCE
  // the deadline to a fresh `now + durationMs`, which let any participant
  // indefinitely neutralise the timeout by reconnecting before it expired.
  // That is the mirror image of the silent-forfeit problem C4 exists to
  // prevent, so it is fixed here rather than after merge.
  //
  // turnDeadlineFor (flip-turn-timer.ts) is what keeps these separate: the
  // DEADLINE only advances when the turn/pending-action's own signature
  // changes (a genuinely new one), never merely because a broadcast
  // happened. The CALLBACK below is still rescheduled every time — for
  // whatever time remains until that (possibly unchanged) deadline, not
  // for a fresh full duration — which is what keeps a genuine reconnect BY
  // THE TURN PLAYER THEMSELVES correctly still running toward the original
  // ceiling (#448's C4 argument), rather than accidentally cancelling or
  // resetting their own clock.
  //
  // A turn/pending-action is "live" only during round-in-progress with a
  // turn player set; awaiting-round-start, round-over and game-over all
  // correctly compute `null` (nothing to time out) and clear both the
  // timer and the tracked deadline from the round that just ended.
  const isLiveTurn = state !== null && state.phase === 'round-in-progress' && state.turnPlayerId !== null;
  let turnDeadline: number | null = null;
  if (isLiveTurn) {
    // #394 — dev tooling gets a much longer duration, never an exemption
    // (Caroline's ruling): the DevPanel seat-switcher workflow depends on
    // this read, not on the timeout being a no-op. One extra read per
    // broadcast, same tradeoff #396 already made for round history.
    const createdVia = await gamesDb.getGameCreatedVia(gameId);
    const durationMs = createdVia === 'dev_seed' ? FLIP_DEV_TURN_TIMEOUT_MS : FLIP_TURN_TIMEOUT_MS;
    // #394 review round 2 (QA) — turnPlayerId + pendingAction.kind alone is
    // too coarse: a NESTED Flip 3 drawn while dealing through an outer
    // one's stack re-sets pendingAction back to the SAME {kind:'flip3'} for
    // the SAME turnPlayerId, synchronously inside chooseFlip3Target's own
    // advance() call, with no intervening broadcast in between. That made
    // the nested target choice inherit whatever time was left on the outer
    // one instead of getting its own window — a quieter version of the
    // exact silent-forfeit problem C4 exists to prevent.
    //
    // Fix: fold in the id of the card that produced the CURRENT pause. Every
    // one of the four public mutators (hit/freeze/chooseFreezeTarget/
    // chooseFlip3Target) resets resolutionLog to [] before calling advance,
    // and advance() never returns — to a genuine pause OR to "nothing
    // pending, waiting on the next hit/freeze decision" — without first
    // drawing and appending at least one card (see the dealQueue and
    // flip3Stack loops in game.ts's advance()); the very first call at round
    // start is no exception, since it deals the opening hands before ever
    // returning. So the LAST resolutionLog entry at the moment this state is
    // read is always the draw that produced whatever is being timed right
    // now, and drawFromShoe/buildFlipDeck give every card instance a
    // globally unique id (flip-cards.ts's `${idPrefix}:${counter}`) — two
    // states with the same turnPlayerId, same pendingAction.kind AND the
    // same trailing card id are, by construction, re-broadcasts of the
    // SAME pause, never two different ones. (The 'start' fallback below is
    // unreachable for a state that has ever been visible to a client, for
    // exactly that reason, and only exists so this can't throw on an
    // unresolved-yet-somehow-empty log.)
    const lastEvent = state.resolutionLog[state.resolutionLog.length - 1] ?? null;
    const signature = `${state.turnPlayerId}:${state.pendingAction?.kind ?? 'none'}:${lastEvent?.card.id ?? 'start'}`;
    turnDeadline = turnDeadlineFor(gameId, signature, durationMs);
    const remainingMs = Math.max(0, turnDeadline - Date.now());
    scheduleFlipTurnTimeout(gameId, remainingMs, () => fireFlipTurnTimeout(gameId));
  } else {
    cancelFlipTurnTimeout(gameId);
    clearTurnDeadline(gameId);
  }

  // #406 — a Flip room in the lobby has no table yet, and that is NORMAL under
  // the ruled awaiting-round-start flow: no Flip state exists until the dealer
  // starts the first round. This used to `return` here, sending the client
  // nothing at all, so every real host landed on a permanently blank lobby.
  //
  // The original reasoning — "the client keeps whatever it last had rather
  // than crashing on a half-built view" — was written for a half-built table
  // mid-round, and is simply false on a FRESH socket: a reconnecting client
  // has no last-had to keep. `/play/host` opens exactly such a socket.
  //
  // So suppress the TABLE, not the message: the room and player state still go
  // out, which is all the lobby needs to render. `flip: null` is a first-class
  // "no table yet", never a malformed one.
  //
  // #396 — round history comes from flip_round_scores, not the state blob: a
  // completed round's score is an immutable fact, and the blob holds only the
  // current round plus cumulative totals. One extra read per broadcast, which
  // is what keeps the scoreboard correct across a reconnect. Skipped entirely
  // when there is no table, since there can be no history either.
  const flip = state
    ? toFlipTableView(state, groupRoundsByPlayer(await flipGamesDb.getFlipRoundScores(gameId)), turnDeadline)
    : null;
  // #329 (#505 QA finding) — a browser's SECOND connection (#454's
  // architecture) is treated as a reconnect and gets game_state, never
  // joined_game; omitting this here left a non-captain's actually-rendered
  // client with no way to ever receive the captain's live pick.
  const lobbyConfig = getLobbyConfig(gameId);
  const gameSockets = getGameSockets(gameId);

  for (const [playerId] of gameSockets) {
    const message: ServerMessage = {
      type: 'game_state',
      game,
      players,
      localPlayerId: playerId,
      flip,
      lobbyConfig,
    };
    sendToPlayer(gameId, playerId, message);
  }
}

/**
 * Build a player-specific view of the game state.
 * CRITICAL: Redacts wire values for OTHER players' hidden wires.
 * Each player can see their own wire values but not other players' hidden values.
 * This is the hidden information security boundary.
 */
export function buildPlayerView(wires: Wire[], requestingPlayerId: string): Wire[] {
  return wires.map(wire => {
    if (wire.playerId !== requestingPlayerId && wire.status === 'hidden') {
      // #187: color is redacted alongside value — on red-wire missions the
      // color map alone is mission-deciding information.
      return { ...wire, value: null, color: null };
    }
    return wire;
  });
}

/**
 * Send full game state to all players in a game, with per-player redaction.
 *
 * #445 — `players` is deliberately NOT a parameter. Every call site used to
 * pass in whatever roster it had already fetched earlier in its own flow;
 * under two overlapping mutations (most reproducibly two joins, but the
 * same race applies to a join racing a leave) the call whose full async
 * chain finished last won the broadcast to every socket, even carrying the
 * OLDER snapshot — a client could end up stuck on a stale roster
 * indefinitely, with nothing to force a correction. Querying fresh here
 * means whichever broadcast actually goes out last is also guaranteed
 * current, so the race can desync a client for at most one message, never
 * permanently. See #445 and the doc comment on broadcastFlipGameState.
 */
export async function broadcastGameState(
  gameId: string,
  game: Game,
): Promise<void> {
  // An active Spades room has hidden hands. Its state is persisted as one
  // authoritative engine blob, then projected separately for every socket.
  // Branch before the generic wire payload so another player's hand can
  // never leak through a room-wide message.
  if (game.gameType === 'spades' && game.status !== 'waiting') {
    const state = await spadesGamesDb.getSpadesGameState(gameId);
    if (state) {
      await broadcastPrivateSpadesState(gameId, state, game);
      return;
    }
  }

  // #382 — branch BEFORE any wire-game DB call. This used to run
  // getWiresByGameId unconditionally, so a Flip game received a state message
  // full of wire-shaped emptiness and the client sat on the lobby screen
  // forever. Returning early is also what guarantees no wiresDb/tokensDb/
  // candidatesDb query is issued on a Flip path at all.
  if (game.gameType === 'flip') {
    await broadcastFlipGameState(gameId, game);
    return;
  }

  const players = await playersDb.getPlayersByGameId(gameId);
  const wires = await wiresDb.getWiresByGameId(gameId);
  const infoTokens = await tokensDb.getInfoTokensByGameId(gameId);
  const validationTokens = await tokensDb.getValidationTokensByGameId(gameId);
  // #215 groundwork — broadcast identically to every player, no redaction
  // (a candidate has no owner to redact against). Empty for every mission
  // today; no config uses N-of-M yet.
  const candidates = await candidatesDb.getWireCandidatesByGameId(gameId);
  // #329 (#505 QA finding) — same fix as broadcastFlipGameState above, same
  // reason: this is what a browser's second (reconnect) connection actually
  // receives.
  const lobbyConfig = getLobbyConfig(gameId);

  const gameSockets = getGameSockets(gameId);

  for (const [playerId] of gameSockets) {
    const playerWires = buildPlayerView(wires, playerId);
    const message: ServerMessage = {
      type: 'game_state',
      game,
      players,
      wires: playerWires,
      infoTokens,
      validationTokens,
      localPlayerId: playerId,
      candidates,
      lobbyConfig,
    };
    sendToPlayer(gameId, playerId, message);
  }
}
