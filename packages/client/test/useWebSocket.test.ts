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
});
