import type { WebSocket } from 'ws';
import type { AuthenticatedUser } from './auth.js';
import type { LobbyConfigValue } from '@tabletop/shared';

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

// #329 — the lobby's in-progress config value, keyed by gameId. Ephemeral
// and in-memory on purpose: it's a live preview of the captain's pick, not
// authoritative game data (that stays `start_game`'s own `mission` field),
// so it does not belong in the games table and does not need to survive a
// server restart. Callers clear it once it stops being relevant — the
// lobby closes (room_closed) or the game actually starts — so this never
// accumulates entries beyond the currently-open lobbies.
const lobbyConfigs = new Map<string, LobbyConfigValue>();

export function setLobbyConfig(gameId: string, config: LobbyConfigValue): void {
  lobbyConfigs.set(gameId, config);
}

export function getLobbyConfig(gameId: string): LobbyConfigValue | null {
  return lobbyConfigs.get(gameId) ?? null;
}

export function clearLobbyConfig(gameId: string): void {
  lobbyConfigs.delete(gameId);
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
  const gameMap = gameConnections.get(gameId)!;

  // #454 — a player id can already have a DIFFERENT live socket registered
  // here: a stale connection the client never explicitly tore down (a
  // leaked WS from an earlier screen, a slow reconnect racing a fresh one)
  // reconnecting after the real, currently-visible connection already took
  // over. Registration is last-write-wins, so without evicting the old
  // socket here it stays a live, authenticated connection that can later
  // reconnect AGAIN and silently steal broadcast routing back from the
  // socket the player is actually looking at — including room_closed,
  // which is exactly how a mid-game player got stranded on stale content
  // while an invisible orphaned socket quietly received everything instead.
  // Closing it here (rather than just overwriting the map entry) makes that
  // whole class of misrouting impossible regardless of what leaked it.
  const stale = gameMap.get(playerId);
  if (stale && stale !== socket && stale.readyState <= 1 /* CONNECTING or OPEN */) {
    // Deregister BEFORE closing: the close we trigger below still fires the
    // server's own 'close' handler asynchronously (handleDisconnect), which
    // would otherwise arm a fresh #446 grace-window leave for this exact
    // player — wrong, since they're still connected, just on the socket
    // we're registering right now. With no entry left for this stale
    // socket, that handler's `getConnectionInfo` finds nothing and no-ops.
    connections.delete(stale);
    authenticatedUsers.delete(stale);
    stale.close(1000, 'Superseded by a newer connection for this player');
  }

  gameMap.set(playerId, socket);
}

export function removeConnection(socket: WebSocket): void {
  const info = connections.get(socket);
  if (info) {
    const gameMap = gameConnections.get(info.gameId);
    // Only remove the game-level registration if IT still points at this
    // exact socket. A stale/superseded connection's own close can fire
    // after a newer one has already re-registered for the same player id;
    // deleting unconditionally here would erase that newer, valid entry
    // out from under it.
    if (gameMap && gameMap.get(info.playerId) === socket) {
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
