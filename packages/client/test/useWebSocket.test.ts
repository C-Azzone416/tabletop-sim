import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "../app/hooks/useWebSocket";
import type { ServerMessage } from "@tabletop/shared";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn().mockImplementation(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "" });
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "" });
  }

  simulateError() {
    this.onerror?.({});
  }
}

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts disconnected", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));
    expect(result.current.status).toBe("disconnected");
  });

  it("connects and transitions to connected status", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    expect(result.current.status).toBe("connecting");

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());
    expect(result.current.status).toBe("connected");
  });

  it("passes parsed messages to onMessage callback", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    const msg: ServerMessage = { type: "error", message: "test" };
    act(() => ws.simulateMessage(msg));
    expect(onMessage).toHaveBeenCalledWith(msg);
  });

  it("sends messages when connected", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    act(() => result.current.send({ type: "start_game" }));
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "start_game" }));
  });

  it("queues messages when not connected and flushes on connect", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.send({ type: "start_game" }));
    act(() => result.current.connect());
    const ws = MockWebSocket.instances[0];
    expect(ws.send).not.toHaveBeenCalled();

    act(() => ws.simulateOpen());
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "start_game" }));
  });

  it("reconnects with exponential backoff on close", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    const ws1 = MockWebSocket.instances[0];
    act(() => ws1.simulateOpen());

    act(() => ws1.simulateClose());
    expect(result.current.status).toBe("disconnected");
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances).toHaveLength(2);

    const ws2 = MockWebSocket.instances[1];
    act(() => ws2.simulateClose());

    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("does not reconnect on close code 4001 (unauthenticated)", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    act(() => { ws.onclose?.({ code: 4001, reason: "unauthenticated" }); });
    expect(result.current.status).toBe("disconnected");

    act(() => vi.advanceTimersByTime(5000));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("disconnect sets status to disconnected", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    act(() => result.current.disconnect());
    expect(result.current.status).toBe("disconnected");
    expect(ws.close).toHaveBeenCalled();
  });

  // #467 — the ~7% switchToSeat flake: a deliberate disconnect() (e.g.
  // DevPanel's seat switch, which closes with a non-4001 code) still
  // scheduled a reconnect for the socket it had just closed, since only
  // code 4001 skipped that. The resulting stray reconnect fired against
  // whatever profileId was CURRENT by the time its timer elapsed — not the
  // seat being abandoned — colliding with the real new connection via
  // connection-manager's #469 eviction, whose own close (also not 4001)
  // scheduled ANOTHER stray reconnect, and so on: a self-sustaining
  // ping-pong that never let the client settle on the right identity.
  describe("disconnect() never schedules a reconnect for the socket it closes (#467)", () => {
    it("a plain disconnect() does not reconnect", () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() => useWebSocket(onMessage));

      act(() => result.current.connect());
      const ws = MockWebSocket.instances[0];
      act(() => ws.simulateOpen());

      act(() => result.current.disconnect());
      act(() => vi.advanceTimersByTime(30_000));

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    // The exact case that broke: a non-4001 code (DevPanel's seat-switch
    // close) — before this fix, only 4001 was exempt, so this specific
    // call is what triggered the ping-pong.
    it("disconnect(code, reason) with a non-4001 code does not reconnect either", () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() => useWebSocket(onMessage));

      act(() => result.current.connect());
      const ws = MockWebSocket.instances[0];
      act(() => ws.simulateOpen());

      act(() => result.current.disconnect(4700, "dev seat switch"));
      act(() => vi.advanceTimersByTime(30_000));

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    // A disconnect() call while there's nothing to close (already
    // disconnected) must not leave the suppression armed and wrongly
    // swallow a LATER, genuinely-unexpected close's reconnect.
    it("does not suppress a later unrelated close's reconnect", () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() => useWebSocket(onMessage));

      act(() => result.current.disconnect()); // nothing connected yet — no-op

      act(() => result.current.connect());
      const ws = MockWebSocket.instances[0];
      act(() => ws.simulateOpen());
      act(() => ws.simulateClose()); // a genuine, unexpected close

      act(() => vi.advanceTimersByTime(1000));
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    // An unrelated genuine close AFTER an intentional disconnect() still
    // reconnects normally — the suppression is one-shot, not sticky.
    it("a genuine close after a prior intentional disconnect still reconnects", () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() => useWebSocket(onMessage));

      act(() => result.current.connect());
      const ws1 = MockWebSocket.instances[0];
      act(() => ws1.simulateOpen());
      act(() => result.current.disconnect());
      act(() => vi.advanceTimersByTime(30_000));
      expect(MockWebSocket.instances).toHaveLength(1);

      act(() => result.current.connect());
      const ws2 = MockWebSocket.instances[1];
      act(() => ws2.simulateOpen());
      act(() => ws2.simulateClose());

      act(() => vi.advanceTimersByTime(1000));
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it("unmount closes the socket without leaving a reconnect timer armed", () => {
      const onMessage = vi.fn();
      const { result, unmount } = renderHook(() => useWebSocket(onMessage));

      act(() => result.current.connect());
      const ws = MockWebSocket.instances[0];
      act(() => ws.simulateOpen());

      unmount();
      act(() => vi.advanceTimersByTime(30_000));

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    // #467 review — the deeper bug found during live verification: the mock
    // above fires onclose SYNCHRONOUSLY inside close(), which can never
    // reproduce this. A real browser's close handshake is asynchronous, so
    // a disconnect()+connect() pair (exactly what the seat switcher does)
    // can have a NEWER socket already live in wsRef.current by the time the
    // OLD socket's own onclose finally fires. Without an identity check,
    // that late close unconditionally nulled wsRef.current, wiping the
    // reference to the live connection — every subsequent send() then
    // queued forever with nothing to flush it, and (with the ping-pong
    // above already fixed) nothing left to reconnect and repair it either.
    it("a stale socket's late close does not wipe the reference to a newer connection", () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() => useWebSocket(onMessage));

      act(() => result.current.connect());
      const ws1 = MockWebSocket.instances[0];
      act(() => ws1.simulateOpen());

      // Defer ws1's onclose rather than letting the mock's close() fire it
      // synchronously, so the disconnect+connect below can race ahead of it
      // exactly as happens over a real network.
      ws1.close = vi.fn();
      act(() => result.current.disconnect(4700, "dev seat switch"));

      act(() => result.current.connect());
      const ws2 = MockWebSocket.instances[1];
      act(() => ws2.simulateOpen());
      expect(result.current.status).toBe("connected");

      // ws1's close handshake finally completes, late.
      act(() => { ws1.onclose?.({ code: 4700, reason: "dev seat switch" }); });

      // The live connection (ws2) must be unaffected.
      expect(result.current.status).toBe("connected");
      act(() => result.current.send({ type: "player_ready" }));
      expect(ws2.send).toHaveBeenCalled();
      expect(ws1.send).not.toHaveBeenCalled();

      // And no reconnect should have been scheduled for the stale socket.
      act(() => vi.advanceTimersByTime(30_000));
      expect(MockWebSocket.instances).toHaveLength(2);
    });
  });

  // #462 — disconnect(code, reason) is additive: a plain disconnect() call
  // (the test above) still closes with no arguments, exactly as before.
  // This is what lets a caller (GameClient's seat switch) distinguish an
  // intentional close from a genuine one at the WS layer.
  it("disconnect(code, reason) passes both through to the socket's close call", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    act(() => result.current.disconnect(4700, "dev seat switch"));
    expect(ws.close).toHaveBeenCalledWith(4700, "dev seat switch");
  });

  it("handles errors by closing the connection", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    act(() => ws.simulateError());
    expect(ws.close).toHaveBeenCalled();
  });

  it("ignores malformed messages without crashing", () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() => useWebSocket(onMessage));

    act(() => result.current.connect());
    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    act(() => { ws.onmessage?.({ data: "not json{{{" }); });
    expect(onMessage).not.toHaveBeenCalled();
  });

  describe("URL building", () => {
    it("includes profileId and playerName in WS URL", () => {
      const onMessage = vi.fn();
      const { result } = renderHook(
        (props) => useWebSocket(props.onMessage, props.profileId, props.playerName),
        { initialProps: { onMessage, profileId: "abc123", playerName: "Alice" } },
      );
      act(() => result.current.connect());
      expect(MockWebSocket.instances[0].url).toContain("profileId=abc123");
      expect(MockWebSocket.instances[0].url).toContain("name=Alice");
    });

    it("builds base URL when no auth params provided", () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() => useWebSocket(onMessage));
      act(() => result.current.connect());
      const url = MockWebSocket.instances[0].url;
      expect(url).not.toContain("profileId");
      expect(url).not.toContain("name=");
    });

    it("rebuilds connect with updated URL when profileId changes (stale closure regression)", () => {
      const onMessage = vi.fn();
      const { result, rerender } = renderHook(
        (props) => useWebSocket(props.onMessage, props.profileId, props.playerName),
        { initialProps: { onMessage, profileId: "", playerName: "" } },
      );

      const connectBefore = result.current.connect;
      rerender({ onMessage, profileId: "xyz", playerName: "Bob" });
      const connectAfter = result.current.connect;

      // connect must be a new reference when deps change (dep array fix)
      expect(connectAfter).not.toBe(connectBefore);

      // The new connect builds the URL with updated params
      act(() => result.current.connect());
      expect(MockWebSocket.instances[0].url).toContain("profileId=xyz");
      expect(MockWebSocket.instances[0].url).toContain("name=Bob");
    });
  });
});
