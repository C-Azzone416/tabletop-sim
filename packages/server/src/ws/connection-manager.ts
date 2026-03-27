import type { WebSocket } from 'ws';
import type { AuthenticatedUser } from './auth.js';

interface ConnectionInfo {
  playerId: string;
  gameId: string;
  socket: WebSocket;
}

const connections = new Map<WebSocket, ConnectionInfo>();
const gameConnections = new Map<string, Map<string, WebSocket>>();
const authenticatedUsers = new Map<WebSocket, AuthenticatedUser>();

export function setAuthenticatedUser(socket: WebSocket, user: AuthenticatedUser): void {
  authenticatedUsers.set(socket, user);
}

export function getAuthenticatedUser(socket: WebSocket): AuthenticatedUser | undefined {
  return authenticatedUsers.get(socket);
}

export function registerConnection(socket: WebSocket, playerId: string, gameId: string): void {
  connections.set(socket, { playerId, gameId, socket });

  if (!gameConnections.has(gameId)) {
    gameConnections.set(gameId, new Map());
  }
  gameConnections.get(gameId)!.set(playerId, socket);
}

export function removeConnection(socket: WebSocket): void {
  const info = connections.get(socket);
  if (info) {
    const gameMap = gameConnections.get(info.gameId);
    if (gameMap) {
      gameMap.delete(info.playerId);
      if (gameMap.size === 0) {
        gameConnections.delete(info.gameId);
      }
    }
    connections.delete(socket);
  }
  authenticatedUsers.delete(socket);
}

export function getConnectionInfo(socket: WebSocket): ConnectionInfo | undefined {
  return connections.get(socket);
}

export function getGameSockets(gameId: string): Map<string, WebSocket> {
  return gameConnections.get(gameId) ?? new Map();
}

export function getPlayerSocket(gameId: string, playerId: string): WebSocket | undefined {
  const gameMap = gameConnections.get(gameId);
  return gameMap?.get(playerId);
}

export function sendToPlayer(gameId: string, playerId: string, message: unknown): void {
  const gameMap = gameConnections.get(gameId);
  if (!gameMap) return;
  const socket = gameMap.get(playerId);
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

export function broadcastToGame(gameId: string, message: unknown, excludePlayerId?: string): void {
  const gameMap = gameConnections.get(gameId);
  if (!gameMap) return;
  const data = JSON.stringify(message);
  for (const [playerId, socket] of gameMap) {
    if (playerId !== excludePlayerId && socket.readyState === 1) {
      socket.send(data);
    }
  }
}
