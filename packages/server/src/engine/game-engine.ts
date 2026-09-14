import { randomInt } from 'node:crypto';
import { MISSION_CONFIGS, WIRE_MASTER_SET, getGameById } from '@tabletop/shared';
import type { Game, GameId, Player, Wire, Turn, WireColor, MissionOutcome, WireCandidate } from '@tabletop/shared';
import * as gamesDb from '../db/games.js';
import * as playersDb from '../db/players.js';
import * as wiresDb from '../db/wires.js';
import * as tokensDb from '../db/tokens.js';
import * as turnsDb from '../db/turns.js';
import * as outcomesDb from '../db/outcomes.js';
import * as candidatesDb from '../db/candidates.js';
import { startFlipGame, leaveGame as applyFlipLeave, type FlipGameState } from '@tabletop/game-flip';
import * as flipGamesDb from '../db/flip-games.js';
import { dealWires } from './wire-dealer.js';

// #170 — the single way a game reaches 'won'/'lost'. Besides the status
// transition, records the mission outcome for every seated profile
// (best-outcome-wins upsert), so the home-screen indicators and #179's
// unlock derivation always have the record the moment the game ends —
// including before a #157 next_mission resets the same game row.
async function endGame(gameId: string, result: 'won' | 'lost'): Promise<Game> {
  const endedGame = await gamesDb.updateGameStatus(gameId, result);

  // #170 amendment (dingo 03:23, heron 03:39): dev-seeded games (via
  // /dev/seed, /dev/seed-near-win) must record NO outcomes — they're not
  // real play and would pollute the home-screen indicators / #179's
  // unlocks. Checked on created_via, not ENABLE_DEV_SEED, so real staging
  // playtests (lobby-created, ENABLE_DEV_SEED may still be true there) are
  // unaffected.
  const createdVia = await gamesDb.getGameCreatedVia(gameId);
  if (createdVia === 'dev_seed') {
    return endedGame;
  }

  const profileIds = await playersDb.getPlayerProfileIdsByGameId(gameId);
  for (const profileId of profileIds) {
    await outcomesDb.upsertMissionOutcome(profileId, endedGame.mission, result);
  }
  return endedGame;
}

// #179 — beat-to-unlock: mission 1 is always unlocked; mission N+1 unlocks
// only once N has been WON (losses unlock nothing). Pure derivation from
// #170's outcome records, no new schema. Capped at the highest configured
// mission so a captain who's beaten everything doesn't unlock a mission
// number that doesn't exist.
export function getHighestUnlockedMission(outcomes: MissionOutcome[]): number {
  const highestBeaten = outcomes.reduce((max, o) => (o.outcome === 'won' && o.mission > max ? o.mission : max), 0);
  const maxConfiguredMission = Math.max(...Object.keys(MISSION_CONFIGS).map(Number));
  return Math.min(highestBeaten + 1, maxConfiguredMission);
}

// Explicit requirement (#179): ENABLE_DEV_SEED=true skips unlock validation
// server-side. Same combined gate as every other /dev/* bypass in app.ts —
// structurally impossible to activate in production regardless of
// misconfiguration elsewhere. Re-read at call time (not cached at module
// load) so tests can toggle it per-case.
function devUnlockBypassActive(): boolean {
  return process.env.ENABLE_DEV_SEED === 'true' && process.env.NODE_ENV !== 'production';
}

async function assertMissionUnlocked(captainPlayerId: string, mission: number): Promise<void> {
  if (devUnlockBypassActive()) return;

  const captainProfileId = await playersDb.getPlayerProfileId(captainPlayerId);
  if (!captainProfileId) return;

  const outcomes = await outcomesDb.getMissionOutcomesByProfileId(captainProfileId);
  if (mission > getHighestUnlockedMission(outcomes)) {
    throw new Error('Mission is locked');
  }
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}

export async function createGame(
  playerName: string,
  gameType: GameId,
  maxPlayers: number,
  profileId?: string,
  createdVia: gamesDb.GameCreatedVia = 'lobby',
): Promise<{ game: Game; player: Player }> {
  // #437 — the actual security gate: message-handler's shape check only
  // confirms maxPlayers looks like a number before it gets here, and the dev
  // seed's own parsing has already validated its callers' input too, but
  // this is the one place both paths go through, so it is where a count
  // outside the game's registry bounds is refused, not either caller.
  const entry = getGameById(gameType);
  if (!entry) throw new Error('Unknown game type');
  if (!Number.isInteger(maxPlayers) || maxPlayers < entry.minPlayers || maxPlayers > entry.maxPlayers) {
    throw new Error('Invalid player count');
  }

  const joinCode = generateJoinCode();
  const game = await gamesDb.createGame(joinCode, gameType, maxPlayers, 1, createdVia);
  const player = await playersDb.createPlayer(game.id, playerName, 0, profileId);
  const updatedGame = await gamesDb.updateGameCaptain(game.id, player.id);
  return { game: updatedGame, player };
}

export async function joinGame(joinCode: string, playerName: string, profileId?: string): Promise<{ game: Game; player: Player; players: Player[] }> {
  const game = await gamesDb.getGameByJoinCode(joinCode);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'waiting') throw new Error('Game already started');

  const existingPlayers = await playersDb.getPlayersByGameId(game.id);
  // #437 — the room's own persisted capacity, not the game's registry
  // ceiling. #370 made this registry-derived rather than a hardcoded 4;
  // #437 goes one step further, since the registry ceiling was never the
  // host's actual choice — a host who said 3 must get a room that fills at
  // 3, even though the game itself might allow more. game.maxPlayers is set
  // at createGame (validated against the registry there) and is always
  // present, so there is no registry fallback needed here anymore.
  if (existingPlayers.length >= game.maxPlayers) throw new Error('Game is full');

  const player = await playersDb.createPlayer(game.id, playerName, existingPlayers.length, profileId);
  const players = await playersDb.getPlayersByGameId(game.id);
  return { game, player, players };
}

/**
 * #438 — the host resizing the room's player count from the lobby, before
 * everyone is ready. Every gate here is a Caroline ruling or an explicit
 * scope point from the issue, not a default:
 *
 *  - Host only (`requestingPlayerId` must be the room's captain). A
 *    non-host attempting this must be refused server-side, not merely
 *    hidden client-side — this is the actual enforcement, the lobby UI
 *    hiding the control for non-captains is just the friendly version.
 *  - Lobby only (`game.status === 'waiting'`) — the issue's own second
 *    question, resolved "assumed no" and confirmed by "before everyone
 *    says they are ready" itself. A room past the lobby is never
 *    'waiting', so this same check covers both "not started yet" and
 *    (for Flip, whose occupancy can fall mid-game per #434) "already
 *    started" without a separate branch.
 *  - Locks once everyone currently seated is ready — readiness needs an
 *    actual consequence, and this is it.
 *  - Bounded by the game's registry entry, exactly like createGame's own
 *    maxPlayers validation (#437) — a fixed-size game (minPlayers ===
 *    maxPlayers, e.g. Spades) has no valid value to move to, so any call
 *    for one is refused.
 *  - Caroline's ruling on lowering below current occupancy: refused, not
 *    resolved by ejecting anyone. Silently removing a seated player is a
 *    worse surprise than an unavailable control, and the host can ask
 *    them to leave. Overridable by Caroline later; this is the spec until
 *    then.
 *
 * No bespoke ack: the caller broadcasts the updated `game` the same way
 * every other mutation does, and "every player in the lobby sees the
 * change without a refresh" falls out of that broadcast path for free —
 * the same one #445 hardened to query the roster fresh rather than trust
 * a caller-held snapshot.
 */
export async function updatePlayerCount(gameId: string, requestingPlayerId: string, maxPlayers: number): Promise<{ game: Game }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.captainId !== requestingPlayerId) throw new Error('Only the host can change the player count');
  if (game.status !== 'waiting') throw new Error('Player count can only change in the lobby');

  const players = await playersDb.getPlayersByGameId(gameId);
  if (players.length > 0 && players.every(p => p.ready)) {
    throw new Error('Player count is locked once everyone is ready');
  }

  const entry = getGameById(game.gameType);
  if (!entry) throw new Error('Unknown game type');
  // A fixed-size game (Spades: 4-4) has no other value to move to — refuse
  // outright rather than accepting a no-op "change" to the value it's
  // already at, matching the issue's "offers no control at all".
  if (
    entry.minPlayers === entry.maxPlayers ||
    !Number.isInteger(maxPlayers) ||
    maxPlayers < entry.minPlayers ||
    maxPlayers > entry.maxPlayers
  ) {
    throw new Error('Invalid player count');
  }
  // Static message, not interpolated with the count: message-handler's
  // safeMessages allowlist matches error text exactly, and the client
  // already renders "Players (X/Y)" itself, so the count doesn't need to
  // ride in the error string for the UI to explain why.
  if (maxPlayers < players.length) {
    throw new Error('Cannot lower below the players already in the lobby');
  }

  const updatedGame = await gamesDb.updateMaxPlayers(gameId, maxPlayers);
  return { game: updatedGame };
}

/**
 * #402 — starting a Flip room from the real lobby.
 *
 * `startGame` below is wire-game shaped end to end: it deals wire tiles,
 * validates a mission, and lands on `setup`. Running it for a Flip room wrote
 * 24 wire tiles into it and never created any Flip state, so the broadcaster
 * had nothing to send and the client sat on the lobby forever. Flip needs its
 * own start, not a branch threaded through that one.
 *
 * Lands on the engine's `awaiting-round-start`, where the dealer's existing
 * "Start Round" button drives the opening deal through the normal
 * `flip_start_round` action. That keeps one path for dealing a round rather
 * than a second one here.
 */
export async function startFlipRoom(
  gameId: string,
  requestingPlayerId: string,
): Promise<{ game: Game; players: Player[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.gameType !== 'flip') throw new Error('Not a Flip game');
  if (game.status !== 'waiting') throw new Error('Game already started');
  if (game.captainId !== requestingPlayerId) throw new Error('Only the captain can start the game');

  const players = await playersDb.getPlayersByGameId(gameId);
  if (!players.every(p => p.ready)) throw new Error('Not all players are ready');

  // Bounds come from the registry, the same source the join gate uses, so the
  // two cannot disagree about how many seats Flip takes. `game.gameType` is
  // already checked to be 'flip' above, which is always registered — #436
  // dropped the `?? 2`/`?? 5` fallback since a missing entry here would mean
  // the registry itself is broken, not something to paper over with stale
  // hardcoded bounds.
  const entry = getGameById(game.gameType);
  if (!entry) throw new Error('Unknown game type');
  if (players.length < entry.minPlayers) throw new Error(`Need at least ${entry.minPlayers} players`);
  if (players.length > entry.maxPlayers) throw new Error(`Flip seats at most ${entry.maxPlayers} players`);

  const state = startFlipGame({
    players: players.map(p => ({ id: p.id, name: p.name })),
  });
  await flipGamesDb.saveFlipGameState(gameId, state);

  const updatedGame = await gamesDb.updateGameStatus(gameId, 'active');
  return { game: updatedGame, players };
}

export type LeaveGameResult =
  | { outcome: 'noop' }
  | { outcome: 'room_closed'; reason: string }
  | { outcome: 'left'; leftPlayer: Player; players: Player[]; gameEnded: boolean };

// #432 — a non-host mid-game leave in Wire Game ends the mission, but
// unlike the host case (#431) the ROOM SURVIVES: everyone lands back in
// the lobby of the same room, not /play (Caroline: "this will help games
// restart faster ... instead of having to create a new lobby"). Tears down
// this mission's state exactly like executeNextMission's cleanup
// (wires/tokens/turns/candidates, double-detector usage) so a restart
// deals fresh rather than resuming the abandoned mission, then resets the
// game row to a genuine 'waiting' state and every remaining player's
// ready/setup_done flags — the host resizes (#438) and hits Start again,
// same as any other fresh lobby.
async function endWireGameToLobby(gameId: string): Promise<void> {
  await turnsDb.deleteByGameId(gameId);
  await wiresDb.deleteByGameId(gameId);
  await candidatesDb.deleteByGameId(gameId);
  await tokensDb.deleteValidationTokensByGameId(gameId);
  await playersDb.resetDoubleDetectorForGame(gameId);
  await playersDb.resetReadyAndSetupForGame(gameId);
  await gamesDb.clearPendingDualCut(gameId);
  await gamesDb.clearPendingInterrogation(gameId);
  await gamesDb.updateDetonator(gameId, 0);
  await gamesDb.updateCurrentTurn(gameId, null);
  await gamesDb.updateGameStatus(gameId, 'waiting');
}

// #434 — a non-host leaving Flip drops their seat but the game continues,
// UNLESS the departure takes the room below Flip's registry floor: Caroline's
// ruling said "confirm, remove, continue," but a below-floor table cannot
// keep playing under that rule, so this is the one case where a Flip
// non-host leave behaves like a host leave (room_closed) rather than like
// #432's Wire Game (gameEnded, room survives) — see leaveGame() below for
// how the two outcomes actually differ (room deletion vs. a continued game).
//
// `remainingPlayerCount` is the SQL players row count AFTER this departure
// (leaveGame already deleted the row and renumbered seats by the time this
// runs) — that is the room's actual live seat count, distinct from the Flip
// engine's own `players` array in the JSONB blob, which never shrinks
// (departed seats stay present, marked 'left', for turn-order/dealer math).
async function dispatchFlipMidGameLeave(
  gameId: string,
  playerId: string,
  remainingPlayerCount: number,
): Promise<{ gameEnded: boolean } | { roomClosed: true; reason: string }> {
  const entry = getGameById('flip');
  const minPlayers = entry?.minPlayers ?? 3;
  if (remainingPlayerCount < minPlayers) {
    return { roomClosed: true, reason: 'Not enough players remain. The game has ended.' };
  }

  const stored = await flipGamesDb.getFlipGameState(gameId);
  if (stored) {
    const next = applyFlipLeave(stored as FlipGameState, playerId);
    await flipGamesDb.saveFlipGameState(gameId, next);
  }
  // #434 — the leaver's score is removed entirely, completed rounds
  // included, regardless of whether Flip state was found above (a missing
  // blob shouldn't leave stale score rows behind either).
  await flipGamesDb.deleteFlipRoundScoresByPlayer(gameId, playerId);

  return { gameEnded: false };
}

// #431 — the per-game dispatch point for a *non-host* mid-game leave.
// Wire Game ends the mission and returns everyone to the lobby (#432);
// Spades will do the same once it exists (#433, parked); Flip drops the
// seat and continues if 3+ players remain, or ends the game if the
// departure takes it below that floor (#434).
async function dispatchNonHostMidGameLeave(
  game: Game,
  _leftPlayer: Player,
  remainingPlayerCount: number,
): Promise<{ gameEnded: boolean } | { roomClosed: true; reason: string }> {
  switch (game.gameType) {
    case 'wire-game':
      await endWireGameToLobby(game.id);
      return { gameEnded: true };
    case 'flip':
      return dispatchFlipMidGameLeave(game.id, _leftPlayer.id, remainingPlayerCount);
    case 'spades':
    default:
      return { gameEnded: false };
  }
}

// #431 — leave_game and "disconnect treated as a leave" both funnel through
// here. Two Caroline rulings shape it:
//
//   1. The host leaving closes the room, in every phase and every game.
//      Captaincy never reassigns — deleting the room (not the player row)
//      is what keeps that true: there is no longer a live room for a null
//      captainId to exist on, so the invariant holds by construction rather
//      than by any reassignment logic.
//   2. A non-host leaving frees their seat (re-joinable — see
//      players.renumberSeats) and, past the lobby, hits the per-game
//      dispatch point above.
//
// Tolerates a game or player that's already gone (double leave_game, or a
// leave racing a concurrent room close) by returning 'noop' rather than
// throwing — the caller has nothing left to broadcast either way.
export async function leaveGame(gameId: string, playerId: string): Promise<LeaveGameResult> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) return { outcome: 'noop' };

  const player = await playersDb.getPlayerById(playerId);
  if (!player || player.gameId !== gameId) return { outcome: 'noop' };

  if (game.captainId === playerId) {
    await gamesDb.deleteGame(gameId);
    return { outcome: 'room_closed', reason: 'The host left. The room has been closed.' };
  }

  await playersDb.deletePlayer(playerId);
  await playersDb.renumberSeats(gameId);
  const players = await playersDb.getPlayersByGameId(gameId);

  let gameEnded = false;
  if (game.status !== 'waiting') {
    const dispatched = await dispatchNonHostMidGameLeave(game, player, players.length);
    // #434 — a below-floor Flip departure ends the room exactly like a host
    // leave: delete the row (captaincy-free, same as the host case) rather
    // than returning 'left' with gameEnded — there is no lobby left for
    // anyone to land back in, unlike #432's Wire Game gameEnded case.
    if ('roomClosed' in dispatched) {
      await gamesDb.deleteGame(gameId);
      return { outcome: 'room_closed', reason: dispatched.reason };
    }
    gameEnded = dispatched.gameEnded;
  }

  return { outcome: 'left', leftPlayer: player, players, gameEnded };
}

export async function startGame(gameId: string, requestingPlayerId: string, mission: number = 1): Promise<{ game: Game; players: Player[]; wires: Wire[]; candidates: WireCandidate[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'waiting') throw new Error('Game already started');
  if (game.captainId !== requestingPlayerId) throw new Error('Only the captain can start the game');

  const players = await playersDb.getPlayersByGameId(gameId);
  if (players.length < 1) throw new Error('Need at least 1 player');
  if (!players.every(p => p.ready)) throw new Error('Not all players are ready');

  const missionConfig = MISSION_CONFIGS[mission];
  if (!missionConfig) throw new Error('Invalid mission');
  await assertMissionUnlocked(requestingPlayerId, mission);

  // Lives = players − 1 (spec rule: 2p = 1 life, 3p = 2 lives, 4p = 3 lives)
  const detonatorMax = Math.max(1, players.length - 1);

  // Store the selected mission
  await gamesDb.updateMission(gameId, mission);

  // Deal wires for the selected mission
  const playerIds = players.map(p => p.id);
  const { wires: dealedWires, candidates: dealtCandidates } = dealWires(playerIds, game.captainId!, mission);

  const createdWires: Wire[] = [];
  for (const dw of dealedWires) {
    const wire = await wiresDb.createWire(gameId, dw.playerId, dw.value, dw.color, dw.rackPosition);
    createdWires.push(wire);
  }

  // #215 groundwork — persist the partial-knowledge candidate pool (empty
  // for every mission today; no config uses N-of-M yet).
  const createdCandidates: WireCandidate[] = [];
  for (const c of dealtCandidates) {
    createdCandidates.push(await candidatesDb.createWireCandidate(gameId, c.color, c.value));
  }

  // Update game to setup phase and kick off turn-ordered opening placement:
  // captain (always seat 0) places first, then clockwise via advanceTurn.
  await gamesDb.updateDetonator(gameId, 0);
  await gamesDb.updateGameStatus(gameId, 'setup');
  await gamesDb.updateCurrentTurn(gameId, game.captainId!);
  const updatedGame = await gamesDb.updateDetonatorMax(gameId, detonatorMax);

  return { game: updatedGame, players, wires: createdWires, candidates: createdCandidates };
}

// #157 — "continue playing" after a win or loss: the same game row (same id,
// same joinCode, same seated players) is reused for the next mission rather
// than rebuilding a lobby. Ruled approved (#continue-playing, 2026-07-23):
// same-game-row transition, hard-delete the prior mission's wires/tokens/
// turns (round-scoped history is a deliberate future follow-up, #163), next-
// mission-up default clamped/validated by the caller via `mission`.
export async function executeNextMission(
  gameId: string,
  requestingPlayerId: string,
  mission: number,
): Promise<{ game: Game; players: Player[]; wires: Wire[]; candidates: WireCandidate[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'won' && game.status !== 'lost') throw new Error('Game is not in a won or lost state');
  if (game.captainId !== requestingPlayerId) throw new Error('Only the captain can start the next mission');

  const missionConfig = MISSION_CONFIGS[mission];
  if (!missionConfig) throw new Error('Invalid mission');
  await assertMissionUnlocked(requestingPlayerId, mission);

  const players = await playersDb.getPlayersByGameId(gameId);

  // Clear the prior mission's per-mission artifacts before dealing new ones.
  // Order matters: turns reference wires with no ON DELETE cascade, so they
  // must go first; info_tokens cascade from wires automatically. Candidates
  // (#215) are per-mission too, same as wires — cleared alongside them.
  await turnsDb.deleteByGameId(gameId);
  await wiresDb.deleteByGameId(gameId);
  await candidatesDb.deleteByGameId(gameId);
  await tokensDb.deleteValidationTokensByGameId(gameId);
  await playersDb.resetDoubleDetectorForGame(gameId);

  const detonatorMax = Math.max(1, players.length - 1);

  await gamesDb.updateMission(gameId, mission);

  const playerIds = players.map(p => p.id);
  const { wires: dealedWires, candidates: dealtCandidates } = dealWires(playerIds, game.captainId!, mission);

  const createdWires: Wire[] = [];
  for (const dw of dealedWires) {
    const wire = await wiresDb.createWire(gameId, dw.playerId, dw.value, dw.color, dw.rackPosition);
    createdWires.push(wire);
  }

  const createdCandidates: WireCandidate[] = [];
  for (const c of dealtCandidates) {
    createdCandidates.push(await candidatesDb.createWireCandidate(gameId, c.color, c.value));
  }

  await gamesDb.updateDetonator(gameId, 0);
  await gamesDb.clearPendingDualCut(gameId);
  await gamesDb.updateGameStatus(gameId, 'setup');
  await gamesDb.updateCurrentTurn(gameId, game.captainId!);
  const updatedGame = await gamesDb.updateDetonatorMax(gameId, detonatorMax);

  return { game: updatedGame, players, wires: createdWires, candidates: createdCandidates };
}

// Turn-ordered opening placement: captain places first (set as currentTurnPlayerId
// by startGame), then clockwise. Placing a token is the per-player "ready" action
// itself — there's no separate completion step. Once every player has placed,
// this same call transitions the game to 'active' and advances the turn onto
// whoever's real first mission turn is, via the same advanceTurn used for
// ordinary gameplay turns.
export async function executePlaceInfoToken(
  gameId: string,
  playerId: string,
  wireId: string,
): Promise<{ infoToken: import('@tabletop/shared').InfoToken }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');
  if (game.currentTurnPlayerId !== playerId) throw new Error('Not your turn');

  const wire = await wiresDb.getWireById(wireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (wire.playerId !== playerId) throw new Error('Can only place info token on your own wire');
  if (wire.status !== 'hidden') throw new Error('Wire already cut or revealed');
  // #191 — SetupPhase.tsx filters selectable wires to blue client-side only;
  // this is the server-side guard for any path around that single filter
  // (dev seat-switch view, direct message). Setup/opening placement ONLY —
  // the dual-cut deny-path token placement targets whatever wire was asked
  // about and must NOT be constrained here.
  if (wire.color !== 'blue') throw new Error('Opening info token must be placed on a blue wire');

  const [allWires, existingTokens, players] = await Promise.all([
    wiresDb.getWiresByGameId(gameId),
    tokensDb.getInfoTokensByGameId(gameId),
    playersDb.getPlayersByGameId(gameId),
  ]);
  const wireOwner = new Map(allWires.map(w => [w.id, w.playerId]));
  const alreadyPlaced = existingTokens.some(t => wireOwner.get(t.wireId) === playerId);
  if (alreadyPlaced) throw new Error('Info token already placed');

  const infoToken = await tokensDb.createInfoToken(gameId, wireId, wire.value!);

  const playersWithTokens = new Set(
    [...existingTokens, infoToken]
      .map(t => wireOwner.get(t.wireId))
      .filter((id): id is string => !!id)
  );
  const allDone = playersWithTokens.size === players.length;

  await advanceTurn(gameId);
  if (allDone) {
    await gamesDb.updateGameStatus(gameId, 'active');
  }

  return { infoToken };
}

export async function completeSetup(gameId: string): Promise<Game> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'setup') throw new Error('Game is not in setup phase');

  const players = await playersDb.getPlayersByGameId(gameId);
  // Captain goes first
  const captain = players.find(p => p.id === game.captainId);
  if (!captain) throw new Error('Captain not found');

  await gamesDb.updateCurrentTurn(gameId, captain.id);
  return await gamesDb.updateGameStatus(gameId, 'active');
}

export async function executeProposeDualCut(
  gameId: string,
  playerId: string,
  targetWireId: string,
  guessedValue: string,
): Promise<{ game: Game; wire: Wire; targetPlayer: Player }> {
  const game = await validateTurn(gameId, playerId);
  if (game.pendingDualCutWireId) throw new Error('Dual cut already pending');

  const wire = await wiresDb.getWireById(targetWireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (wire.playerId === playerId) throw new Error('Cannot target your own wire with dual cut');
  if (wire.status !== 'hidden') throw new Error('Wire already cut or revealed');
  if (wire.value === null) throw new Error('Wire has no value');

  const targetPlayer = await playersDb.getPlayerById(wire.playerId);
  if (!targetPlayer) throw new Error('Player not found');

  // Physical-game rule: you must already hold a matching tile before you can
  // guess it. Mirrors executeCompleteDualCut's completion-time checks.
  const proposerWires = await wiresDb.getWiresByPlayerId(playerId);
  if (wire.color === 'blue') {
    const holdsMatch = proposerWires.some(w => w.status === 'hidden' && w.value === guessedValue);
    if (!holdsMatch) throw new Error('Must hold a matching wire to propose this guess');
  } else if (wire.color === 'yellow') {
    const holdsYellow = proposerWires.some(w => w.status === 'hidden' && w.color === 'yellow');
    if (!holdsYellow) throw new Error('Must hold a yellow wire to propose this guess');
  }

  const updatedGame = await gamesDb.setPendingDualCut(gameId, playerId, targetWireId, guessedValue);
  return { game: updatedGame, wire, targetPlayer };
}

type RespondDualCutResult =
  | { phase: 'completing'; game: Game; updatedWires: Wire[] }
  | { phase: 'fail' | 'game_over'; turn: Turn; game: Game; updatedWires: Wire[] };

export async function executeRespondDualCut(
  gameId: string,
  playerId: string,
  accepted: boolean,
): Promise<RespondDualCutResult> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'active') throw new Error('Game is not active');
  if (!game.pendingDualCutWireId || !game.pendingDualCutProposerId) throw new Error('No pending dual cut');

  const wire = await wiresDb.getWireById(game.pendingDualCutWireId);
  if (!wire) throw new Error('Wire not found');
  if (wire.playerId !== playerId) throw new Error('Not your wire to respond to');

  const proposerId = game.pendingDualCutProposerId;

  if (accepted) {
    // #190 Phase B — red is never cut, full stop: any cut attempt that
    // resolves to red is an instant loss regardless of accept/reject,
    // unless a saving equipment has been used (checkRedSave — always false
    // today, no equipment system exists yet). Without this guard, an
    // accepted guess against a hidden red wire would reveal it and let
    // executeCompleteDualCut cut it, which the ruling forbids outright.
    if (wire.color === 'red') {
      const saved = await checkRedSave(gameId, proposerId);
      if (!saved) {
        const turn = await turnsDb.createTurn(gameId, proposerId, 'dual_cut', wire.id, game.pendingDualCutGuessedValue);
        await turnsDb.updateTurnResult(turn.id, 'fail');
        await gamesDb.clearPendingDualCut(gameId);
        const lostGame = await endGame(gameId, 'lost');
        return { phase: 'game_over', turn: { ...turn, result: 'fail' }, game: lostGame, updatedWires: [] };
      }
    }
    // Correct guess — reveal the target wire; proposer must still complete their half
    const revealedWire = await wiresDb.updateWireStatus(wire.id, 'revealed');
    const updatedGame = await gamesDb.getGameById(gameId) as Game;
    return { phase: 'completing', game: updatedGame, updatedWires: [revealedWire] };
  }

  // Wrong guess — check wire color for response
  if (wire.color === 'red') {
    // Red wrong guess = immediate game over (same checkRedSave seam as the
    // accept branch above — a rejected guess against red is just as much a
    // "cut attempt that resolves to red" as an accepted one).
    const saved = await checkRedSave(gameId, proposerId);
    if (!saved) {
      const turn = await turnsDb.createTurn(gameId, proposerId, 'dual_cut', wire.id, game.pendingDualCutGuessedValue);
      await turnsDb.updateTurnResult(turn.id, 'fail');
      await gamesDb.clearPendingDualCut(gameId);
      const lostGame = await endGame(gameId, 'lost');
      return { phase: 'game_over', turn: { ...turn, result: 'fail' }, game: lostGame, updatedWires: [] };
    }
  }

  // Blue or yellow wrong guess — place info token (color-aware) + lose 1 life
  const tokenValue = wire.color === 'yellow' ? 'YELLOW' : wire.value!;
  await tokensDb.createInfoToken(gameId, wire.id, tokenValue);

  const turn = await turnsDb.createTurn(gameId, proposerId, 'dual_cut', wire.id, game.pendingDualCutGuessedValue);
  await turnsDb.updateTurnResult(turn.id, 'fail');
  await gamesDb.clearPendingDualCut(gameId);

  const newPosition = game.detonatorPosition + 1;
  let updatedGame = await gamesDb.updateDetonator(gameId, newPosition);

  if (newPosition >= game.detonatorMax) {
    updatedGame = await endGame(gameId, 'lost');
    return { phase: 'game_over', turn: { ...turn, result: 'fail' }, game: updatedGame, updatedWires: [] };
  }

  updatedGame = await advanceTurn(gameId);
  return { phase: 'fail', turn: { ...turn, result: 'fail' }, game: updatedGame, updatedWires: [] };
}

export async function executeCompleteDualCut(
  gameId: string,
  playerId: string,
  ownWireId: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'active') throw new Error('Game is not active');
  if (!game.pendingDualCutWireId || !game.pendingDualCutProposerId) throw new Error('No pending dual cut');
  if (game.pendingDualCutProposerId !== playerId) throw new Error('Not your turn to complete dual cut');

  const targetWire = await wiresDb.getWireById(game.pendingDualCutWireId);
  if (!targetWire) throw new Error('Wire not found');
  if (targetWire.status !== 'revealed') throw new Error('Target wire is not revealed');

  // #190 Phase B — defense in depth: executeRespondDualCut's accept branch
  // already blocks a red target from ever reaching 'revealed', so this
  // should be unreachable in practice. Kept anyway, same pattern as the
  // must-hold check above mirroring propose-time validation — a completion
  // step must never be the one place that actually cuts a red wire.
  if (targetWire.color === 'red') {
    const saved = await checkRedSave(gameId, playerId);
    if (!saved) {
      const turn = await turnsDb.createTurn(gameId, playerId, 'dual_cut', targetWire.id, targetWire.value);
      await turnsDb.updateTurnResult(turn.id, 'fail');
      await gamesDb.clearPendingDualCut(gameId);
      const lostGame = await endGame(gameId, 'lost');
      return { turn: { ...turn, result: 'fail' }, game: lostGame, updatedWires: [] };
    }
  }

  const ownWire = await wiresDb.getWireById(ownWireId);
  if (!ownWire) throw new Error('Wire not found');
  if (ownWire.playerId !== playerId) throw new Error('Wire does not belong to you');
  if (ownWire.gameId !== gameId) throw new Error('Wire does not belong to this game');
  if (ownWire.status !== 'hidden') throw new Error('Wire already cut or revealed');

  // Validate the selected own wire matches target wire rules
  if (targetWire.color === 'blue') {
    if (ownWire.value !== targetWire.value) throw new Error('Must reveal a wire with the same number');
  } else if (targetWire.color === 'yellow') {
    if (ownWire.color !== 'yellow') throw new Error('Must reveal a yellow wire');
  }

  // Cut both wires
  const cutTargetWire = await wiresDb.updateWireStatus(targetWire.id, 'cut');
  const cutOwnWire = await wiresDb.updateWireStatus(ownWireId, 'cut');
  const updatedWires = [cutTargetWire, cutOwnWire];

  const turn = await turnsDb.createTurn(gameId, playerId, 'dual_cut', targetWire.id, targetWire.value, ownWireId);
  await turnsDb.updateTurnResult(turn.id, 'success');

  await gamesDb.clearPendingDualCut(gameId);

  // Check validation for both wires
  await checkValidation(gameId, targetWire.value!, targetWire.color!);
  await checkValidation(gameId, ownWire.value!, ownWire.color!);

  // Check win condition
  let updatedGame: Game;
  const winResult = await checkWinCondition(gameId);
  if (winResult) {
    updatedGame = await endGame(gameId, 'won');
  } else {
    updatedGame = await advanceTurn(gameId);
  }

  return { turn: { ...turn, result: 'success' }, game: updatedGame, updatedWires };
}

export async function executeSoloCut(
  gameId: string,
  playerId: string,
  wireValue: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  await validateTurn(gameId, playerId);

  // #190 Phase B — 'YELLOW' is the same sentinel already used for the
  // dual-cut wrong-guess indicator: yellow has no in-play numeric value
  // (singletons, cut by color not number), so a yellow solo-cut can't
  // target a specific value the way blue does. Color-group scope mirrors
  // #150's value-group scope exactly — holds ALL remaining hidden yellow
  // wires in the game, any values, or the action is illegal.
  const isColorScoped = wireValue === 'YELLOW';

  // Rules-correction (#150) / Phase B: solo cut is legal ONLY when the
  // player holds ALL remaining uncut wires in scope — every value-match
  // (blue) or every hidden yellow (color-scoped) across the whole game
  // must be owned by this player. Hard-rejected up front, before any turn
  // record or detonator change, the same way #133's must-hold-value
  // dual-cut guard rejects at propose time.
  const hiddenInScope = isColorScoped
    ? (await wiresDb.getWiresByColorAndGame(gameId, 'yellow')).filter(w => w.status === 'hidden')
    : (await wiresDb.getWiresByValueAndGame(gameId, wireValue)).filter(w => w.status === 'hidden');
  const holdsAllRemaining = hiddenInScope.length > 0 && hiddenInScope.every(w => w.playerId === playerId);
  if (!holdsAllRemaining) {
    throw new Error(
      isColorScoped
        ? 'You must hold all remaining yellow wires to solo cut them'
        : 'You must hold all remaining uncut wires of that number to solo cut it'
    );
  }

  const turn = await turnsDb.createTurn(gameId, playerId, 'solo_cut', null, wireValue);

  // Legality guarantees every wire in scope belongs to the player — cut
  // them all. Solo cut can no longer fail (that path lived on wrong-guess
  // penalties, which now belong to dual cuts only), so this is always a
  // success.
  const updatedWires: Wire[] = [];
  for (const w of hiddenInScope) {
    const updated = await wiresDb.updateWireStatus(w.id, 'cut');
    updatedWires.push(updated);
  }
  await turnsDb.updateTurnResult(turn.id, 'success');

  // Check validation per (value, color) of what was actually cut — not the
  // outer wireValue/sentinel, since a color-scoped yellow cut spans
  // multiple distinct singleton values in one action.
  const seen = new Set<string>();
  for (const w of hiddenInScope) {
    const key = `${w.value}:${w.color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await checkValidation(gameId, w.value!, w.color!);
  }

  // Check win
  const winResult = await checkWinCondition(gameId);
  if (winResult) {
    const wonGame = await endGame(gameId, 'won');
    return { turn: { ...turn, result: 'success' }, game: wonGame, updatedWires };
  }

  const advancedGame = await advanceTurn(gameId);
  return { turn: { ...turn, result: 'success' }, game: advancedGame, updatedWires };
}

export async function executeDoubleDetector(
  gameId: string,
  playerId: string,
  targetWireId1: string,
  targetWireId2: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  await validateTurn(gameId, playerId);

  const player = await playersDb.getPlayerById(playerId);
  if (!player) throw new Error('Player not found');
  if (player.doubleDetectorUsed) throw new Error('Double detector already used');

  const wire1 = await wiresDb.getWireById(targetWireId1);
  const wire2 = await wiresDb.getWireById(targetWireId2);
  if (!wire1 || !wire2) throw new Error('Wire not found');
  if (wire1.playerId !== playerId || wire2.playerId !== playerId) {
    throw new Error('Double detector can only target your own wires');
  }
  if (wire1.status !== 'hidden' || wire2.status !== 'hidden') {
    throw new Error('Target wires must be hidden');
  }

  await playersDb.markDoubleDetectorUsed(playerId);

  const turn = await turnsDb.createTurn(gameId, playerId, 'double_detector', targetWireId1, null, targetWireId2);

  const sameValue = wire1.value === wire2.value;
  await turnsDb.updateTurnResult(turn.id, sameValue ? 'success' : 'fail');

  // Double detector reveals whether two wires match but doesn't cut them
  // The result is communicated to the player only
  const advancedGame = await advanceTurn(gameId);
  return { turn: { ...turn, result: sameValue ? 'success' : 'fail' }, game: advancedGame, updatedWires: [] };
}

export async function executePlayerReady(
  gameId: string,
  playerId: string,
): Promise<{ players: Player[] }> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'waiting') throw new Error('Game is not in waiting phase');

  await playersDb.markPlayerReady(playerId);
  const players = await playersDb.getPlayersByGameId(gameId);
  return { players };
}

// #190 Phase B — the equipment seam. Reds are never cut; any cut attempt
// that resolves to red is an instant loss UNLESS a saving equipment has
// been used. Equipment isn't designed yet (separate open design topic) —
// this is a single checked precondition that always resolves to no-save,
// deliberately with no speculative equipment types/enums/tables behind it.
// Every red-hit resolution path funnels through this one function so a
// future save hook has exactly one place to plug into.
async function checkRedSave(_gameId: string, _playerId: string): Promise<boolean> {
  return false;
}

async function validateTurn(gameId: string, playerId: string): Promise<Game> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');
  if (game.status !== 'active') throw new Error('Game is not active');
  if (game.currentTurnPlayerId !== playerId) throw new Error('Not your turn');
  return game;
}

// #190 Phase A: blue is the only duplicated color (4 copies/value); yellow
// and red are singletons (1 copy/value in the master set), so "validated"
// for them means that single tile is cut — not a hardcoded 4-copy check,
// which would never fire for yellow/red under the corrected master set.
async function checkValidation(gameId: string, wireValue: string, wireColor: WireColor): Promise<boolean> {
  const expectedCopies = wireColor === 'blue' ? WIRE_MASTER_SET.blue.copiesPerValue : 1;
  const wiresOfValueColor = await wiresDb.getWiresByValueColorAndGame(gameId, wireValue, wireColor);
  const allCut = wiresOfValueColor.every(w => w.status === 'cut');
  if (allCut && wiresOfValueColor.length === expectedCopies) {
    await tokensDb.createValidationToken(gameId, wireValue, wireColor);
    return true;
  }
  return false;
}

export async function executeRevealReds(
  gameId: string,
  playerId: string,
): Promise<{ turn: Turn; game: Game; updatedWires: Wire[] }> {
  const game = await validateTurn(gameId, playerId);

  const missionConfig = MISSION_CONFIGS[game.mission];
  if (!missionConfig) throw new Error('Invalid mission');

  const hasRedWires = missionConfig.wireGroups.some(g => g.color === 'red');
  if (!hasRedWires) throw new Error('Reveal reds not available in this mission');

  const turn = await turnsDb.createTurn(gameId, playerId, 'reveal_reds', null, null);

  // Reveal all hidden red wires across all players in the game
  const updatedWires = await wiresDb.revealRedWires(gameId);

  await turnsDb.updateTurnResult(turn.id, 'success');

  const advancedGame = await advanceTurn(gameId);
  return { turn: { ...turn, result: 'success' }, game: advancedGame, updatedWires };
}

async function checkWinCondition(gameId: string): Promise<boolean> {
  const allWires = await wiresDb.getWiresByGameId(gameId);
  return allWires.every(w => w.status === 'cut');
}

export async function advanceTurn(gameId: string): Promise<Game> {
  const game = await gamesDb.getGameById(gameId);
  if (!game) throw new Error('Game not found');

  const players = await playersDb.getPlayersByGameId(gameId);
  const wires = await wiresDb.getWiresByGameId(gameId);
  const hiddenByPlayer = new Map<string, Wire[]>();
  for (const w of wires) {
    if (w.status === 'hidden') {
      const hand = hiddenByPlayer.get(w.playerId) ?? [];
      hand.push(w);
      hiddenByPlayer.set(w.playerId, hand);
    }
  }

  // Rules-correction (#152): a player with no uncut wires left is skipped
  // when rotating clockwise — no dead turns.
  //
  // #190 Phase B: same turn-start evaluation point also carries the
  // all-red-hand auto-reveal — if a candidate's entire remaining hidden
  // hand is red (any numbers), it reveals all at once (not cut, no life
  // lost, not a player action) and rotation continues past them, since
  // they now correctly have zero hidden wires left (#152 applies).
  //
  // Bounded to one full lap; if every player is fully cut/revealed (should
  // be unreachable, the win condition fires first) this falls through to
  // the plain next seat instead of looping forever.
  const currentIndex = players.findIndex(p => p.id === game.currentTurnPlayerId);
  let nextIndex = currentIndex;
  for (let i = 0; i < players.length; i++) {
    nextIndex = (nextIndex + 1) % players.length;
    const candidate = players[nextIndex];
    const hand = hiddenByPlayer.get(candidate.id) ?? [];
    if (hand.length === 0) continue;

    if (hand.every(w => w.color === 'red')) {
      await wiresDb.revealRedWiresForPlayer(gameId, candidate.id);
      hiddenByPlayer.set(candidate.id, []);
      continue;
    }

    return await gamesDb.updateCurrentTurn(gameId, candidate.id);
  }
  return await gamesDb.updateCurrentTurn(gameId, players[nextIndex].id);
}
