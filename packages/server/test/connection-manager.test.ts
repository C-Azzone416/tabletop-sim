import { describe, it, expect, vi } from "vitest";
import {
  registerConnection,
  removeConnection,
  getConnectionInfo,
  getGameSockets,
  setAuthenticatedUser,
  getAuthenticatedUser,
  broadcastToGame,
  sendToPlayer,
} from "../src/ws/connection-manager.js";
import type { WebSocket } from "ws";

function mockSocket(readyState = 1): WebSocket {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe("connection-manager", () => {
  // Note: the connection manager uses module-level Maps, so state persists
  // between tests. We use unique IDs per test to avoid conflicts.

  it("registers and retrieves a connection", () => {
    const ws = mockSocket();
    registerConnection(ws, "cm-p1", "cm-g1");

    const info = getConnectionInfo(ws);
    expect(info).toBeDefined();
    expect(info?.playerId).toBe("cm-p1");
    expect(info?.gameId).toBe("cm-g1");
  });

  it("tracks game sockets", () => {
    const ws1 = mockSocket();
    const ws2 = mockSocket();
    registerConnection(ws1, "cm-p2", "cm-g2");
    registerConnection(ws2, "cm-p3", "cm-g2");

    const sockets = getGameSockets("cm-g2");
    expect(sockets.size).toBe(2);
    expect(sockets.get("cm-p2")).toBe(ws1);
    expect(sockets.get("cm-p3")).toBe(ws2);
  });

  it("removes a connection", () => {
    const ws = mockSocket();
    registerConnection(ws, "cm-p4", "cm-g3");
    expect(getConnectionInfo(ws)).toBeDefined();

    removeConnection(ws);
    expect(getConnectionInfo(ws)).toBeUndefined();
  });

  it("cleans up game connections when last player leaves", () => {
    const ws = mockSocket();
    registerConnection(ws, "cm-p5", "cm-g4");
    removeConnection(ws);

    const sockets = getGameSockets("cm-g4");
    expect(sockets.size).toBe(0);
  });

  it("sets and gets authenticated user", () => {
    const ws = mockSocket();
    setAuthenticatedUser(ws, { profileId: "prof-1", name: "Alice" });

    const user = getAuthenticatedUser(ws);
    expect(user).toEqual({ profileId: "prof-1", name: "Alice" });
  });

  it("clears authenticated user on removeConnection", () => {
    const ws = mockSocket();
    setAuthenticatedUser(ws, { profileId: "prof-2", name: "Bob" });
    registerConnection(ws, "cm-p6", "cm-g5");
    removeConnection(ws);

    expect(getAuthenticatedUser(ws)).toBeUndefined();
  });

  it("returns empty map for unknown game", () => {
    const sockets = getGameSockets("nonexistent-game");
    expect(sockets.size).toBe(0);
  });

  it("broadcastToGame sends to all players except excluded", () => {
    const ws1 = mockSocket();
    const ws2 = mockSocket();
    const ws3 = mockSocket();
    registerConnection(ws1, "cm-p7", "cm-g6");
    registerConnection(ws2, "cm-p8", "cm-g6");
    registerConnection(ws3, "cm-p9", "cm-g6");

    broadcastToGame("cm-g6", { type: "test" }, "cm-p8");

    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify({ type: "test" }));
    expect(ws2.send).not.toHaveBeenCalled(); // excluded
    expect(ws3.send).toHaveBeenCalledWith(JSON.stringify({ type: "test" }));
  });

  it("broadcastToGame sends to all when no exclusion", () => {
    const ws1 = mockSocket();
    const ws2 = mockSocket();
    registerConnection(ws1, "cm-p10", "cm-g7");
    registerConnection(ws2, "cm-p11", "cm-g7");

    broadcastToGame("cm-g7", { type: "hello" });

    expect(ws1.send).toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalled();
  });

  it("broadcastToGame skips closed sockets", () => {
    const wsOpen = mockSocket(1);
    const wsClosed = mockSocket(3);
    registerConnection(wsOpen, "cm-p12", "cm-g8");
    registerConnection(wsClosed, "cm-p13", "cm-g8");

    broadcastToGame("cm-g8", { type: "msg" });

    expect(wsOpen.send).toHaveBeenCalled();
    expect(wsClosed.send).not.toHaveBeenCalled();
  });

  it("sendToPlayer sends to specific player", () => {
    const ws1 = mockSocket();
    const ws2 = mockSocket();
    registerConnection(ws1, "cm-p14", "cm-g9");
    registerConnection(ws2, "cm-p15", "cm-g9");

    sendToPlayer("cm-g9", "cm-p14", { type: "direct" });

    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify({ type: "direct" }));
    expect(ws2.send).not.toHaveBeenCalled();
  });
});
