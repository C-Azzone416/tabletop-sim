import { describe, it, expect, vi, afterEach } from "vitest";
import {
  registerConnection,
  removeConnection,
  getConnectionInfo,
  getGameSockets,
  setAuthenticatedUser,
  getAuthenticatedUser,
  broadcastToGame,
  sendToPlayer,
  schedulePendingLeave,
  cancelPendingLeave,
  hasPendingLeave,
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

  // #454 — a stale socket for the same player id, still registered when a
  // newer one connects, must not be left able to later reconnect and steal
  // broadcast routing back (the mid-game room_closed misrouting bug).
  describe("registerConnection evicts a stale socket for the same player", () => {
    it("closes the old socket when a new one registers for the same player+game", () => {
      const wsOld = mockSocket();
      const wsNew = mockSocket();
      registerConnection(wsOld, "cm-evict-p1", "cm-evict-g1");

      registerConnection(wsNew, "cm-evict-p1", "cm-evict-g1");

      expect(wsOld.close).toHaveBeenCalled();
    });

    it("routes future broadcasts to the new socket only, not the evicted one", () => {
      const wsOld = mockSocket();
      const wsNew = mockSocket();
      registerConnection(wsOld, "cm-evict-p2", "cm-evict-g2");
      registerConnection(wsNew, "cm-evict-p2", "cm-evict-g2");

      broadcastToGame("cm-evict-g2", { type: "msg" });

      expect(wsNew.send).toHaveBeenCalled();
      expect(wsOld.send).not.toHaveBeenCalled();
    });

    it("deregisters the evicted socket so its own later close is a no-op, not a fresh leave", () => {
      const wsOld = mockSocket();
      const wsNew = mockSocket();
      registerConnection(wsOld, "cm-evict-p3", "cm-evict-g3");
      registerConnection(wsNew, "cm-evict-p3", "cm-evict-g3");

      // The evicted socket's own 'close' handler (handleDisconnect) looks
      // this up before deciding whether to arm a #446 grace-window leave —
      // it must find nothing, or a stale reconnect would spuriously end the
      // still-very-much-connected player's session 20s later.
      expect(getConnectionInfo(wsOld)).toBeUndefined();
    });

    it("does not close an already-closed stale socket, and does not evict a different game's registration", () => {
      const wsClosed = mockSocket(3 /* CLOSED */);
      const wsNew = mockSocket();
      registerConnection(wsClosed, "cm-evict-p4", "cm-evict-g4");

      registerConnection(wsNew, "cm-evict-p4", "cm-evict-g4");

      expect(wsClosed.close).not.toHaveBeenCalled();

      const wsOtherGame = mockSocket();
      registerConnection(wsOtherGame, "cm-evict-p4", "cm-evict-g5");
      expect(wsNew.close).not.toHaveBeenCalled();
    });

    it("re-registering the exact same socket object is a no-op, not a self-eviction", () => {
      const ws = mockSocket();
      registerConnection(ws, "cm-evict-p5", "cm-evict-g6");

      registerConnection(ws, "cm-evict-p5", "cm-evict-g6");

      expect(ws.close).not.toHaveBeenCalled();
      expect(getConnectionInfo(ws)).toBeDefined();
    });
  });

  describe("removeConnection only clears the game-level entry it still owns", () => {
    it("does not erase a newer registration when a superseded socket's own close arrives late", () => {
      const wsOld = mockSocket();
      const wsNew = mockSocket();
      registerConnection(wsOld, "cm-remove-p1", "cm-remove-g1");
      registerConnection(wsNew, "cm-remove-p1", "cm-remove-g1");

      // Simulate the old socket's close handler running after the new one
      // already took over — removeConnection must see it's no longer the
      // registered socket for this player and leave the new one intact.
      removeConnection(wsOld);

      const sockets = getGameSockets("cm-remove-g1");
      expect(sockets.get("cm-remove-p1")).toBe(wsNew);
    });

    it("still removes the entry normally when it is the current socket", () => {
      const ws = mockSocket();
      registerConnection(ws, "cm-remove-p2", "cm-remove-g2");

      removeConnection(ws);

      const sockets = getGameSockets("cm-remove-g2");
      expect(sockets.has("cm-remove-p2")).toBe(false);
    });
  });

  // #446 — the disconnect grace window's timer bookkeeping.
  describe("schedulePendingLeave / cancelPendingLeave", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not fire before the delay elapses", () => {
      vi.useFakeTimers();
      const onFire = vi.fn();
      schedulePendingLeave("cm-pl1", 20_000, onFire);

      vi.advanceTimersByTime(19_999);

      expect(onFire).not.toHaveBeenCalled();
    });

    it("fires once the delay elapses with no cancellation", () => {
      vi.useFakeTimers();
      const onFire = vi.fn();
      schedulePendingLeave("cm-pl2", 20_000, onFire);

      vi.advanceTimersByTime(20_000);

      expect(onFire).toHaveBeenCalledTimes(1);
    });

    it("cancelPendingLeave prevents onFire from ever running", () => {
      vi.useFakeTimers();
      const onFire = vi.fn();
      schedulePendingLeave("cm-pl3", 20_000, onFire);

      const cancelled = cancelPendingLeave("cm-pl3");
      vi.advanceTimersByTime(60_000);

      expect(cancelled).toBe(true);
      expect(onFire).not.toHaveBeenCalled();
    });

    it("cancelPendingLeave returns false when nothing was pending", () => {
      expect(cancelPendingLeave("cm-pl-never-scheduled")).toBe(false);
    });

    it("hasPendingLeave reflects the armed/cancelled/fired state", () => {
      vi.useFakeTimers();
      const onFire = vi.fn();
      expect(hasPendingLeave("cm-pl4")).toBe(false);

      schedulePendingLeave("cm-pl4", 20_000, onFire);
      expect(hasPendingLeave("cm-pl4")).toBe(true);

      cancelPendingLeave("cm-pl4");
      expect(hasPendingLeave("cm-pl4")).toBe(false);
    });

    it("hasPendingLeave clears itself once the timer fires, without an explicit cancel", () => {
      vi.useFakeTimers();
      schedulePendingLeave("cm-pl5", 20_000, vi.fn());

      vi.advanceTimersByTime(20_000);

      expect(hasPendingLeave("cm-pl5")).toBe(false);
    });

    it("scheduling again for the same player replaces (not stacks on top of) an existing timer", () => {
      vi.useFakeTimers();
      const firstOnFire = vi.fn();
      const secondOnFire = vi.fn();
      schedulePendingLeave("cm-pl6", 20_000, firstOnFire);
      schedulePendingLeave("cm-pl6", 20_000, secondOnFire);

      vi.advanceTimersByTime(20_000);

      expect(firstOnFire).not.toHaveBeenCalled();
      expect(secondOnFire).toHaveBeenCalledTimes(1);
    });
  });
});
