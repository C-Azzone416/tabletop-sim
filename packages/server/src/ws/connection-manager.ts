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

// #446 — the disconnect grace window. A WS `close` is not on its own a
// leave: it might be this exact session reconnecting (a reload, a brief
// network drop, a seat switch's own disconnect/connect pair). Keyed by
// playerId, not socket — a reconnect arrives on a brand new socket, so the
// thing that has to survive the swap is the player's identity, not any
// particular connection object.
const pendingLeaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Arms a deferred leave for `playerId`, replacing any timer already
 * pending for them. `onFire` runs once, after `delayMs`, unless
 * {@link cancelPendingLeave} is called first.
 */
export function schedulePendingLeave(playerId: string, delayMs: number, onFire: () => void | Promise<void>): void {
  cancelPendingLeave(playerId);
  const timer = setTimeout(() => {
    pendingLeaveTimers.delete(playerId);
    onFire();
  }, delayMs);
  pendingLeaveTimers.set(playerId, timer);
}

/** Cancels a pending leave for `playerId`, if one is armed. Returns whether one was. */
export function cancelPendingLeave(playerId: string): boolean {
  const timer = pendingLeaveTimers.get(playerId);
  if (!timer) return false;
  clearTimeout(timer);
  pendingLeaveTimers.delete(playerId);
  return true;
}

export function hasPendingLeave(playerId: string): boolean {
  return pendingLeaveTimers.has(playerId);
}

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
