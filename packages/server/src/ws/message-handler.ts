import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@tabletop/shared';
import * as engine from '../engine/game-engine.js';
import * as gamesDb from '../db/games.js';
import * as playersDb from '../db/players.js';
import * as connManager from './connection-manager.js';
import { broadcastGameState, buildPlayerView } from './state-broadcaster.js';
import { applyOnlineSpadesAction, startOnlineSpades } from '../spades/spades-room-service.js';

type ActionLogger = { info: (data: object) => void };
type ActionResult = 'success' | 'fail' | 'explosion' | 'won';

function getAuthenticatedUser(socket: WebSocket) {
  const user = connManager.getAuthenticatedUser(socket);
  if (!user) throw new Error('Not authenticated');
  return user;
}

const MAX_NAME_LENGTH = 20;

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0;
}

function isValidName(val: unknown): val is string {
  return isNonEmptyString(val) && val.length <= MAX_NAME_LENGTH;
}

function validateMessage(parsed: unknown): ClientMessage | null {
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null;
  const msg = parsed as Record<string, unknown>;

  switch (msg.type) {
    case 'create_game': {
      if (!isValidName(msg.playerName)) return null;
      const gameType = msg.gameType === 'spades' || msg.gameType === 'wire-game'
        ? msg.gameType
        : msg.gameType === undefined
          ? 'wire-game'
          : null;
      if (!gameType) return null;
      return { type: 'create_game', playerName: msg.playerName, gameType };
    }
    case 'join_game':
      if (!isNonEmptyString(msg.joinCode) || !isValidName(msg.playerName)) return null;
      return { type: 'join_game', joinCode: msg.joinCode, playerName: msg.playerName };
    case 'start_game': {
      const mission = msg.mission;
      if (mission !== undefined) {
        if (typeof mission !== 'number' || !Number.isInteger(mission) || mission < 1 || mission > 8) return null;
      }
      return { type: 'start_game', mission: mission ?? 1 };
    }
    case 'start_spades': {
      if (msg.targetScore !== 250 && msg.targetScore !== 500 && msg.targetScore !== 750) return null;
      if (!Array.isArray(msg.botDifficulties) || !msg.botDifficulties.every(
        (difficulty) => difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard'
      )) return null;
      return { type: 'start_spades', targetScore: msg.targetScore, botDifficulties: msg.botDifficulties };
    }
    case 'spades_blind_nil':
      if (typeof msg.blindNil !== 'boolean') return null;
      return { type: 'spades_blind_nil', blindNil: msg.blindNil };
    case 'spades_bid': {
      const bid = msg.bid as Record<string, unknown> | undefined;
      if (!bid || (bid.kind !== 'nil' && bid.kind !== 'normal')) return null;
      if (bid.kind === 'normal' && (
        typeof bid.tricks !== 'number' || !Number.isInteger(bid.tricks) || bid.tricks < 1 || bid.tricks > 13
      )) return null;
      return {
        type: 'spades_bid',
        bid: bid.kind === 'nil' ? { kind: 'nil' } : { kind: 'normal', tricks: bid.tricks as number },
      };
    }
    case 'spades_play':
      if (!isNonEmptyString(msg.cardId)) return null;
      return { type: 'spades_play', cardId: msg.cardId };
    case 'place_info_token':
      if (!isNonEmptyString(msg.wireId)) return null;
      return { type: 'place_info_token', wireId: msg.wireId };
    case 'propose_dual_cut':
      if (!isNonEmptyString(msg.targetWireId) || !isNonEmptyString(msg.guessedValue)) return null;
      return { type: 'propose_dual_cut', targetWireId: msg.targetWireId, guessedValue: msg.guessedValue };
    case 'respond_dual_cut':
      if (typeof msg.accepted !== 'boolean') return null;
      return { type: 'respond_dual_cut', accepted: msg.accepted };
    case 'complete_dual_cut':
      if (!isNonEmptyString(msg.ownWireId)) return null;
      return { type: 'complete_dual_cut', ownWireId: msg.ownWireId };
    case 'solo_cut':
      if (!isNonEmptyString(msg.wireValue)) return null;
      return { type: 'solo_cut', wireValue: msg.wireValue };
    case 'double_detector':
      if (!isNonEmptyString(msg.targetWireId) || !isNonEmptyString(msg.targetWireId2)) return null;
      return { type: 'double_detector', targetWireId: msg.targetWireId, targetWireId2: msg.targetWireId2 };
    case 'reveal_reds':
      return { type: 'reveal_reds' };
    case 'player_ready':
      return { type: 'player_ready' };
    case 'next_mission': {
      const mission = msg.mission;
      if (typeof mission !== 'number' || !Number.isInteger(mission) || mission < 1 || mission > 8) return null;
      return { type: 'next_mission', mission };
    }
    default:
      return null;
  }
}

const DB_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`DB timeout: ${label}`)), DB_TIMEOUT_MS)
    ),
  ]);
}

export async function handleMessage(socket: WebSocket, raw: string, log?: ActionLogger): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendError(socket, 'Invalid JSON');
    return;
  }

  const msg = validateMessage(parsed);
  if (!msg) {
    sendError(socket, 'Invalid message format');
    return;
  }

  console.log('[ws] message:', msg.type);

  const priorInfo = connManager.getConnectionInfo(socket);
  let actionResult: ActionResult = 'success';

  try {
    switch (msg.type) {
      case 'create_game':
        await handleCreateGame(socket, msg.playerName, msg.gameType);
        break;
      case 'join_game':
        await handleJoinGame(socket, msg.joinCode, msg.playerName);
        break;
      case 'start_game':
        await handleStartGame(socket, msg.mission ?? 1);
        break;
      case 'start_spades': {
        const info = connManager.getConnectionInfo(socket);
        if (!info) throw new Error('Not connected to a game');
        await startOnlineSpades(info.gameId, info.playerId, msg.targetScore, msg.botDifficulties);
        break;
      }
      case 'spades_blind_nil': {
        const info = connManager.getConnectionInfo(socket);
        if (!info) throw new Error('Not connected to a game');
        await applyOnlineSpadesAction(info.gameId, info.playerId, {
          type: 'blind-nil',
          blindNil: msg.blindNil,
        });
        break;
      }
      case 'spades_bid': {
        const info = connManager.getConnectionInfo(socket);
        if (!info) throw new Error('Not connected to a game');
        await applyOnlineSpadesAction(info.gameId, info.playerId, { type: 'bid', bid: msg.bid });
        break;
      }
      case 'spades_play': {
        const info = connManager.getConnectionInfo(socket);
        if (!info) throw new Error('Not connected to a game');
        await applyOnlineSpadesAction(info.gameId, info.playerId, { type: 'play', cardId: msg.cardId });
        break;
      }
      case 'place_info_token':
        await handlePlaceInfoToken(socket, msg.wireId);
        break;
      case 'propose_dual_cut':
        await handleProposeDualCut(socket, msg.targetWireId, msg.guessedValue);
        break;
      case 'respond_dual_cut':
        actionResult = await handleRespondDualCut(socket, msg.accepted);
        break;
      case 'complete_dual_cut':
        actionResult = await handleCompleteDualCut(socket, msg.ownWireId);
        break;
      case 'solo_cut':
        actionResult = await handleSoloCut(socket, msg.wireValue);
        break;
      case 'double_detector':
        await handleDoubleDetector(socket, msg.targetWireId, msg.targetWireId2);
        break;
      case 'reveal_reds':
        await handleRevealReds(socket);
        break;
      case 'player_ready':
        await handlePlayerReady(socket);
        break;
      case 'next_mission':
        await handleNextMission(socket, msg.mission);
        break;
      default:
        sendError(socket, 'Unknown message type');
    }
  } catch (err) {
    actionResult = 'fail';
    console.error('[ws] handleMessage error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    const safeMessages = [
      'Game not found', 'Game already started', 'Game is full',
      'Not connected to a game', 'Only the captain can start the game',
      'Need at least 2 players', 'Not all players are ready', 'Invalid mission', 'Wire not found', 'Not your turn',
      'Cannot cut your own wire with duo cut', 'Wire already cut or revealed',
      'Wire does not belong to this game', 'Double detector already used',
      'Double detector can only target your own wires', 'Target wires must be hidden',
      'Game is not active', 'Not authenticated', 'Player not found',
      'Reveal reds not available in this mission',
      'Game is not in setup phase', 'Can only place info token on your own wire', 'Info token already placed',
      'Game is not in waiting phase', 'Use the Spades start controls', 'This room is not a Spades game',
      'Spades game has not started', 'Spades supports 1 to 4 human players',
      'Choose one difficulty for each computer seat', 'Player is not seated in this Spades game',
      'Game paused while a player reconnects', 'blind-nil choices are closed',
      'blind-nil choice already locked', 'the game is not accepting bids',
      "it is not this seat's turn to bid", 'this seat already has a bid',
      'the game is not accepting card plays', "it is not this seat's turn to play",
      "card is not in this seat's hand", 'card-not-in-hand', 'must-follow-suit', 'spades-not-broken',
      'Dual cut already pending', 'Cannot target your own wire with dual cut',
      'No pending dual cut', 'Not your wire to respond to',
      'Not your turn to complete dual cut', 'Target wire is not revealed',
      'Must reveal a wire with the same number', 'Must reveal a yellow wire',
      'Wire does not belong to you',
      'Must hold a matching wire to propose this guess', 'Must hold a yellow wire to propose this guess',
      'You must hold all remaining uncut wires of that number to solo cut it',
      'Game is not in a won or lost state', 'Only the captain can start the next mission',
    ];
    sendError(socket, safeMessages.includes(message) ? message : 'Internal error');
  } finally {
    const postInfo = connManager.getConnectionInfo(socket);
    const info = priorInfo ?? postInfo;
    log?.info({ gameId: info?.gameId, playerId: info?.playerId, action: msg.type, result: actionResult });
  }
}

async function handleCreateGame(
  socket: WebSocket,
  _playerName: string,
  gameType: 'wire-game' | 'spades',
): Promise<void> {
  const user = getAuthenticatedUser(socket);
  const { game, player } = await withTimeout(
    engine.createGame(user.name, user.profileId, gameType),
    'createGame',
  );
  connManager.registerConnection(socket, player.id, game.id);

  const response: ServerMessage = { type: 'game_created', game, player };
  socket.send(JSON.stringify(response));
}

async function handleJoinGame(socket: WebSocket, joinCode: string, _playerName: string): Promise<void> {
  const user = getAuthenticatedUser(socket);
  const { game, player, players } = await withTimeout(engine.joinGame(joinCode, user.name, user.profileId), 'joinGame');
  connManager.registerConnection(socket, player.id, game.id);

  const response: ServerMessage = { type: 'joined_game', game, player, players };
  socket.send(JSON.stringify(response));

  // Notify others
  const notification: ServerMessage = { type: 'player_joined', player };
  connManager.broadcastToGame(game.id, notification, player.id);

  // Broadcast full game state so all connected players receive current tokens
  await broadcastGameState(game.id, game, players);
}

async function handleStartGame(socket: WebSocket, mission: number): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const room = await gamesDb.getGameById(info.gameId);
  if (room?.gameType === 'spades') throw new Error('Use the Spades start controls');
  const { game, players, wires } = await withTimeout(engine.startGame(info.gameId, info.playerId, mission), 'startGame');

  // Send game_started with per-player wire views
  const gameSockets = connManager.getGameSockets(info.gameId);
  for (const [playerId, playerSocket] of gameSockets) {
    const playerWires = buildPlayerView(wires, playerId);
    const response: ServerMessage = { type: 'game_started', game, players, wires: playerWires };
    playerSocket.send(JSON.stringify(response));
  }
}

async function handleNextMission(socket: WebSocket, mission: number): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { game, players } = await withTimeout(
    engine.executeNextMission(info.gameId, info.playerId, mission),
    'executeNextMission',
  );

  // game_state, same as every other turn action — not the game_started
  // snowflake handleStartGame uses for the one-time lobby transition. The
  // fresh wires/infoTokens/validationTokens this pulls are correctly empty
  // (executeNextMission cleared the prior mission's), and it includes
  // localPlayerId, which the overlay-to-board transition needs same as any
  // other live state push.
  await broadcastGameState(info.gameId, game, players);
}

async function handlePlaceInfoToken(socket: WebSocket, wireId: string): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  await withTimeout(engine.executePlaceInfoToken(info.gameId, info.playerId, wireId), 'executePlaceInfoToken');

  // Broadcast full game state so all players see the new info token
  const game = await gamesDb.getGameById(info.gameId);
  if (!game) throw new Error('Game not found');
  const players = await playersDb.getPlayersByGameId(info.gameId);
  await broadcastGameState(info.gameId, game, players);
}

async function handleProposeDualCut(socket: WebSocket, targetWireId: string, guessedValue: string): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { game: _game, wire, targetPlayer } = await withTimeout(
    engine.executeProposeDualCut(info.gameId, info.playerId, targetWireId, guessedValue),
    'executeProposeDualCut',
  );

  const notification: ServerMessage = {
    type: 'dual_cut_proposed',
    proposingPlayerId: info.playerId,
    targetPlayerId: targetPlayer.id,
    targetWireId: wire.id,
    targetWireRackPosition: wire.rackPosition,
    guessedValue,
  };
  connManager.broadcastToGame(info.gameId, notification);
}

async function handleRespondDualCut(socket: WebSocket, accepted: boolean): Promise<ActionResult> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const result = await withTimeout(
    engine.executeRespondDualCut(info.gameId, info.playerId, accepted),
    'executeRespondDualCut',
  );

  const players = await playersDb.getPlayersByGameId(info.gameId);

  if (result.phase === 'completing') {
    // Correct guess — reveal wire to all, then prompt proposer to complete
    const { game, updatedWires } = result;

    // Broadcast revealed wire with per-player views (revealed status visible to all)
    const gameSockets = connManager.getGameSockets(info.gameId);
    for (const [playerId, playerSocket] of gameSockets) {
      const playerWireView = buildPlayerView(updatedWires, playerId);
      const stateMsg: ServerMessage = { type: 'game_state', game, players, wires: playerWireView, infoTokens: [], validationTokens: [], localPlayerId: playerId };
      playerSocket.send(JSON.stringify(stateMsg));
    }
    await broadcastGameState(info.gameId, game, players);

    // Notify the proposer to complete their half of the dual cut
    const pendingWire = updatedWires[0];
    const correctMsg: ServerMessage = {
      type: 'dual_cut_correct',
      targetWireId: pendingWire.id,
      targetWireRackPosition: pendingWire.rackPosition,
      targetWireColor: pendingWire.color,
    };
    connManager.broadcastToGame(info.gameId, correctMsg);
    return 'success';
  }

  // Fail or game_over
  const { turn, game, updatedWires } = result;
  const gameSockets = connManager.getGameSockets(info.gameId);
  for (const [playerId, playerSocket] of gameSockets) {
    const playerWireView = buildPlayerView(updatedWires, playerId);
    const response: ServerMessage = { type: 'turn_result', turn, game, updatedWires: playerWireView };
    playerSocket.send(JSON.stringify(response));
  }

  const updatedGame = await gamesDb.getGameById(info.gameId);
  if (updatedGame) {
    await broadcastGameState(info.gameId, updatedGame, players);
  }

  if (game.status === 'won' || game.status === 'lost') {
    const reason = game.status === 'won' ? 'All wires cut!' : 'Wrong guess cost the last life!';
    connManager.broadcastToGame(info.gameId, { type: 'game_over', result: game.status, reason });
  }

  if (game.status === 'lost') return 'explosion';
  if (game.status === 'won') return 'won';
  return 'fail';
}

async function handleCompleteDualCut(socket: WebSocket, ownWireId: string): Promise<ActionResult> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { turn, game, updatedWires } = await withTimeout(
    engine.executeCompleteDualCut(info.gameId, info.playerId, ownWireId),
    'executeCompleteDualCut',
  );

  const players = await playersDb.getPlayersByGameId(info.gameId);

  const gameSockets = connManager.getGameSockets(info.gameId);
  for (const [playerId, playerSocket] of gameSockets) {
    const playerWireView = buildPlayerView(updatedWires, playerId);
    const response: ServerMessage = { type: 'turn_result', turn, game, updatedWires: playerWireView };
    playerSocket.send(JSON.stringify(response));
  }

  const updatedGame = await gamesDb.getGameById(info.gameId);
  if (updatedGame) {
    await broadcastGameState(info.gameId, updatedGame, players);
  }

  if (game.status === 'won' || game.status === 'lost') {
    const reason = game.status === 'won' ? 'All wires cut!' : 'Detonator reached skull!';
    connManager.broadcastToGame(info.gameId, { type: 'game_over', result: game.status, reason });
  }

  if (game.status === 'lost') return 'explosion';
  if (game.status === 'won') return 'won';
  return 'success';
}

async function handleSoloCut(socket: WebSocket, wireValue: string): Promise<ActionResult> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { turn, game, updatedWires } = await withTimeout(engine.executeSoloCut(info.gameId, info.playerId, wireValue), 'executeSoloCut');

  const gameSockets = connManager.getGameSockets(info.gameId);
  for (const [playerId, playerSocket] of gameSockets) {
    const playerWireView = buildPlayerView(updatedWires, playerId);
    const response: ServerMessage = { type: 'turn_result', turn, game, updatedWires: playerWireView };
    playerSocket.send(JSON.stringify(response));
  }

  if (game.status === 'won' || game.status === 'lost') {
    const reason = game.status === 'won' ? 'All wires cut!' : 'Detonator reached skull!';
    connManager.broadcastToGame(info.gameId, { type: 'game_over', result: game.status, reason });
  }

  if (game.status === 'lost') return 'explosion';
  if (game.status === 'won') return 'won';
  return 'success';
}

async function handleDoubleDetector(socket: WebSocket, targetWireId: string, targetWireId2: string): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { turn, game } = await withTimeout(engine.executeDoubleDetector(info.gameId, info.playerId, targetWireId, targetWireId2), 'executeDoubleDetector');

  // Only the requesting player sees the result detail
  const response: ServerMessage = { type: 'turn_result', turn, game, updatedWires: [] };
  socket.send(JSON.stringify(response));

  // Others just see that a turn happened (with no wire details)
  connManager.broadcastToGame(info.gameId, { type: 'turn_result', turn: { ...turn, result: null }, game, updatedWires: [] }, info.playerId);
}

async function handleRevealReds(socket: WebSocket): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { turn, game, updatedWires } = await withTimeout(engine.executeRevealReds(info.gameId, info.playerId), 'executeRevealReds');

  // Broadcast revealed wires — everyone sees red values now (owner sees via 'revealed' status)
  const gameSockets = connManager.getGameSockets(info.gameId);
  for (const [playerId, playerSocket] of gameSockets) {
    const playerWireView = buildPlayerView(updatedWires, playerId);
    const response: ServerMessage = { type: 'turn_result', turn, game, updatedWires: playerWireView };
    playerSocket.send(JSON.stringify(response));
  }
}

async function handlePlayerReady(socket: WebSocket): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { players } = await withTimeout(engine.executePlayerReady(info.gameId, info.playerId), 'executePlayerReady');

  const response: ServerMessage = { type: 'players_updated', players };
  connManager.broadcastToGame(info.gameId, response);
}


function sendError(socket: WebSocket, message: string): void {
  const response: ServerMessage = { type: 'error', message };
  socket.send(JSON.stringify(response));
}
