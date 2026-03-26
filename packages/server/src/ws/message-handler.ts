import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@tabletop/shared';
import * as engine from '../engine/game-engine.js';
import * as gamesDb from '../db/games.js';
import * as playersDb from '../db/players.js';
import * as connManager from './connection-manager.js';
import { broadcastGameState, buildPlayerView } from './state-broadcaster.js';

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
    case 'create_game':
      if (!isValidName(msg.playerName)) return null;
      return { type: 'create_game', playerName: msg.playerName };
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
    case 'place_info_token':
      if (!isNonEmptyString(msg.wireId)) return null;
      return { type: 'place_info_token', wireId: msg.wireId };
    case 'duo_cut':
      if (!isNonEmptyString(msg.targetWireId) || !isNonEmptyString(msg.guessedValue)) return null;
      return { type: 'duo_cut', targetWireId: msg.targetWireId, guessedValue: msg.guessedValue };
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

export async function handleMessage(socket: WebSocket, raw: string): Promise<void> {
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

  try {
    switch (msg.type) {
      case 'create_game':
        await handleCreateGame(socket, msg.playerName);
        break;
      case 'join_game':
        await handleJoinGame(socket, msg.joinCode, msg.playerName);
        break;
      case 'start_game':
        await handleStartGame(socket, msg.mission ?? 1);
        break;
      case 'place_info_token':
        await handlePlaceInfoToken(socket, msg.wireId);
        break;
      case 'duo_cut':
        await handleDuoCut(socket, msg.targetWireId, msg.guessedValue);
        break;
      case 'solo_cut':
        await handleSoloCut(socket, msg.wireValue);
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
      default:
        sendError(socket, 'Unknown message type');
    }
  } catch (err) {
    console.error('[ws] handleMessage error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    const safeMessages = [
      'Game not found', 'Game already started', 'Game is full',
      'Not connected to a game', 'Only the captain can start the game',
      'Need at least 2 players', 'Invalid mission', 'Wire not found', 'Not your turn',
      'Cannot cut your own wire with duo cut', 'Wire already cut or revealed',
      'Wire does not belong to this game', 'Double detector already used',
      'Double detector can only target your own wires', 'Target wires must be hidden',
      'Game is not active', 'Not authenticated', 'Player not found',
      'Reveal reds not available in this mission',
      'Game is not in setup phase', 'Can only place info token on your own wire',
      'Game is not in waiting phase',
    ];
    sendError(socket, safeMessages.includes(message) ? message : 'Internal error');
  }
}

async function handleCreateGame(socket: WebSocket, _playerName: string): Promise<void> {
  const user = getAuthenticatedUser(socket);
  const { game, player } = await withTimeout(engine.createGame(user.name, user.profileId), 'createGame');
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
}

async function handleStartGame(socket: WebSocket, mission: number): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { game, players, wires } = await withTimeout(engine.startGame(info.gameId, info.playerId, mission), 'startGame');

  // Send game_started with per-player wire views
  const gameSockets = connManager.getGameSockets(info.gameId);
  for (const [playerId, playerSocket] of gameSockets) {
    const playerWires = buildPlayerView(wires, playerId);
    const response: ServerMessage = { type: 'game_started', game, players, wires: playerWires };
    playerSocket.send(JSON.stringify(response));
  }
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

async function handleDuoCut(socket: WebSocket, targetWireId: string, guessedValue: string): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { turn, game, updatedWires } = await withTimeout(engine.executeDuoCut(info.gameId, info.playerId, targetWireId, guessedValue), 'executeDuoCut');

  const players = await playersDb.getPlayersByGameId(info.gameId);

  // Broadcast turn result with per-player wire views
  const gameSockets = connManager.getGameSockets(info.gameId);
  for (const [playerId, playerSocket] of gameSockets) {
    const playerWireView = buildPlayerView(updatedWires, playerId);
    const response: ServerMessage = { type: 'turn_result', turn, game, updatedWires: playerWireView };
    playerSocket.send(JSON.stringify(response));
  }

  // If game over, broadcast
  if (game.status === 'won' || game.status === 'lost') {
    const reason = game.status === 'won' ? 'All wires cut!' : 'Detonator reached skull!';
    connManager.broadcastToGame(info.gameId, { type: 'game_over', result: game.status, reason });
  }
}

async function handleSoloCut(socket: WebSocket, wireValue: string): Promise<void> {
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
