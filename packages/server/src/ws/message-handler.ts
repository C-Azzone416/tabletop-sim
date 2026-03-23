import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@tabletop/shared';
import * as engine from '../engine/game-engine.js';
import * as playersDb from '../db/players.js';
import * as connManager from './connection-manager.js';
import { broadcastGameState, buildPlayerView } from './state-broadcaster.js';

export async function handleMessage(socket: WebSocket, raw: string): Promise<void> {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendError(socket, 'Invalid JSON');
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
        await handleStartGame(socket);
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
    sendError(socket, err instanceof Error ? err.message : 'Unknown error');
  }
}

async function handleCreateGame(socket: WebSocket, playerName: string): Promise<void> {
  const { game, player } = await engine.createGame(playerName);
  connManager.registerConnection(socket, player.id, game.id);

  const response: ServerMessage = { type: 'game_created', game, player };
  socket.send(JSON.stringify(response));
}

async function handleJoinGame(socket: WebSocket, joinCode: string, playerName: string): Promise<void> {
  const { game, player, players } = await engine.joinGame(joinCode, playerName);
  connManager.registerConnection(socket, player.id, game.id);

  const response: ServerMessage = { type: 'joined_game', game, player, players };
  socket.send(JSON.stringify(response));

  // Notify others
  const notification: ServerMessage = { type: 'player_joined', player };
  connManager.broadcastToGame(game.id, notification, player.id);
}

async function handleStartGame(socket: WebSocket): Promise<void> {
  const info = connManager.getConnectionInfo(socket);
  if (!info) throw new Error('Not connected to a game');

  const { game, players, wires } = await engine.startGame(info.gameId, info.playerId);

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
