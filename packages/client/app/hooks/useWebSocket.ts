"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import type { ClientMessage, ServerMessage } from "@tabletop/shared";
import { SERVER_URL, withApiKeyParam } from "../lib/serverApi";

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

type ConnectionStatus = "connecting" | "connected" | "disconnected";
type MessageHandler = (message: ServerMessage) => void;

export function useWebSocket(
  onMessage: MessageHandler,
  profileId?: string,
  playerName?: string,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const connectRef = useRef<() => void>(() => {});
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const messageQueueRef = useRef<ClientMessage[]>([]);
  // #467 — set true immediately before disconnect() closes a socket it
  // still holds, so that socket's own onclose (which fires later,
  // asynchronously, once the close handshake completes) knows this close
  // was deliberate and must not schedule a reconnect. Without this, only
  // code 4001 (auth failure) skipped the reconnect — an intentional
  // disconnect() for any other reason (e.g. DevPanel's seat-switch
  // teardown) still scheduled one, against a `connect` closure that, by
  // the time the timer fires, is bound to whatever profileId is CURRENT
  // rather than the seat being abandoned. That stray reconnection then
  // collides with the real new connection for the current seat via
  // connection-manager's #469 eviction, whose own close (also not 4001)
  // schedules another stray reconnect in turn — a self-sustaining
  // ping-pong that left the client's WS connection never settling on the
  // right identity, which is what actually produced #467's flaky
  // post-switch timeouts (the symptom was downstream of this, not a
  // literal click timeout).
  const suppressReconnectRef = useRef(false);
  const [status, setStatus] = useState("disconnected" as ConnectionStatus);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const flushQueue = useCallback((ws: WebSocket) => {
    while (messageQueueRef.current.length > 0) {
      const msg = messageQueueRef.current.shift()!;
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const base = SERVER_URL.replace(/^http/, "ws") + "/ws";
    const params = new URLSearchParams();
    if (profileId) params.set("profileId", profileId);
    if (playerName) params.set("name", playerName);
    withApiKeyParam(params);
    const wsUrl = params.toString() ? `${base}?${params}` : base;
    setStatus("connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      flushQueue(ws);
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        onMessageRef.current(message);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      console.warn("[ws] connection closed", { code: event.code, reason: event.reason });
      // #467 — this handler is bound to THIS socket instance (`ws`), but it
      // fires asynchronously once the close handshake completes — by then a
      // disconnect()+connect() pair (the DevPanel seat switcher does exactly
      // this) can already have replaced wsRef.current with a newer, live
      // socket. Without this identity check, a late close for the OLD
      // socket unconditionally nulled wsRef.current, wiping the reference to
      // the new connection — `send()` then silently queues forever, since
      // nothing else repairs wsRef.current and (with the ping-pong fixed
      // below) nothing schedules a reconnect to replace it either. Only the
      // socket that's still actually current may touch shared state.
      const isCurrentSocket = wsRef.current === ws;
      if (isCurrentSocket) {
        setStatus("disconnected");
        wsRef.current = null;
      }
      // #467 — a close WE asked for via disconnect() must never schedule a
      // reconnect, regardless of code: see suppressReconnectRef's doc
      // comment above for the ping-pong this otherwise causes.
      if (suppressReconnectRef.current) {
        suppressReconnectRef.current = false;
        return;
      }
      // A superseded socket reconnecting would just race the one that
      // already replaced it — only the current socket's own close is worth
      // recovering from.
      if (!isCurrentSocket) return;
      // Don't reconnect on auth failure — server rejected us, retrying won't help
      if (event.code === 4001) return;
      // Exponential backoff reconnect
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), delay);
    };

    ws.onerror = (event) => {
      console.error("[ws] error", event);
      ws.close();
    };
  }, [flushQueue, profileId, playerName]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // #462 — `code`/`reason` let a caller distinguish an intentional close
  // (the DevPanel seat switcher passes DEV_SEAT_SWITCH_CLOSE_CODE) from a
  // genuine disconnect. Plain `disconnect()` with no args behaves exactly
  // as before — this is additive, not a change to any existing call site.
  const disconnect = useCallback((code?: number, reason?: string) => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    messageQueueRef.current = [];
    // #467 — only arm the suppression if there's actually a socket whose
    // onclose will consume it; otherwise a disconnect() call with nothing
    // to close would leave it set and wrongly suppress the NEXT, unrelated
    // close.
    if (wsRef.current) {
      suppressReconnectRef.current = true;
      wsRef.current.close(code, reason);
    }
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const send = useCallback((message: ClientMessage) => {
    console.log('[ws] send:', message.type);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Queue message to be sent when connection opens
      messageQueueRef.current.push(message);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      // #467 — same suppression as disconnect(): an unmount is definitely
      // not a moment to reconnect, and without this a stray timer could
      // fire after unmount and open a zombie socket nothing is using.
      if (wsRef.current) {
        suppressReconnectRef.current = true;
        wsRef.current.close();
      }
    };
  }, []);

  return { status, connect, disconnect, send };
}
