import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@tabletop/shared';
import * as engine from '../engine/game-engine.js';
import * as playersDb from '../db/players.js';
import * as connManager from './connection-manager.js';
import { broadcastGameState, buildPlayerView } from './state-broadcaster.js';

function getAuthenticatedName(socket: WebSocket): string {
  const user = connManager.getAuthenticatedUser(socket);
  if (!user) throw new Error('Not authenticated');
  return user.name;
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
    default:
      return null;
  }
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
        // Handled during setup phase — for now just acknowledge
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
      default:
        sendError(socket, 'Unknown message type');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const safeMessages = [
      'Game not found', 'Game already started', 'Game is full',
      'Not connected to a game', 'Only the captain can start the game',
      'Need at least 2 players', 'Wire not found', 'Not your turn',
      'Cannot cut your own wire with duo cut', 'Wire already cut or revealed',
      'Wire does not belong to this game', 'Double detector already used',
      'Double detector can only target your own wires', 'Target wires must be hidden',
      'Game is not active', 'Not authenticated', 'Player not found',
    ];
    sendError(socket, safeMessages.includes(message) ? message : 'Internal error');
  }
}

async function handleCreateGame(socket: WebSocket, _playerName: string): Promise<void> {
  const authenticatedName = getAuthenticatedName(socket);
  const { game, player } = await engine.createGame(authenticatedName);
  connManager.registerConnection(socket, player.id, game.id);

  const response: ServerMessage = { type: 'game_created', game, player };
  socket.send(JSON.stringify(response));
}

async function handleJoinGame(socket: WebSocket, joinCode: string, _playerName: string): Promise<void> {
  const authenticatedName = getAuthenticatedName(socket);
  const { game, player, players } = await engine.joinGame(joinCode, authenticatedName);
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

  const { game, players, wires } = await engine.startGame(info.gameId, info.playerId, mission);

  // Send game_started with per-player wire views
  const gameSockets = connManager.getGameSockets(info.gameId);
  for (const [playerId, playerSocket] of gameSockets) {
    const playerWires = buildPlayerView(wires, playerId);
    const response: ServerMessage = { type: 'game_started', game, players, wires: playerWires };
    playerSocket.send(JSON.stringify(response));
  }
}

async function handleDuoCut(socket: WebSocket, targetWireId: string, guessedValue: string): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { turn, game, updatedWires } = await engine.executeDuoCut(info.gameId, info.playerId, targetWireId, guessedValue);

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

  const { turn, game, updatedWires } = await engine.executeSoloCut(info.gameId, info.playerId, wireValue);

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

  const { turn, game } = await engine.executeDoubleDetector(info.gameId, info.playerId, targetWireId, targetWireId2);

  // Only the requesting player sees the result detail
  const response: ServerMessage = { type: 'turn_result', turn, game, updatedWires: [] };
  socket.send(JSON.stringify(response));

  // Others just see that a turn happened (with no wire details)
  connManager.broadcastToGame(info.gameId, { type: 'turn_result', turn: { ...turn, result: null }, game, updatedWires: [] }, info.playerId);
}

function sendError(socket: WebSocket, message: string): void {
  const response: ServerMessage = { type: 'error', message };
  socket.send(JSON.stringify(response));
}
