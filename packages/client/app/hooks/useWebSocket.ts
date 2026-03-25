"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import type { ClientMessage, ServerMessage } from "@tabletop/shared";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const messageQueueRef = useRef<ClientMessage[]>([]);
  const [status, setStatus] = useState("disconnected" as ConnectionStatus);

  onMessageRef.current = onMessage;

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
      setStatus("disconnected");
      wsRef.current = null;
      // Exponential backoff reconnect
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (event) => {
      console.error("[ws] error", event);
      ws.close();
    };
  }, [flushQueue]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    messageQueueRef.current = [];
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const send = useCallback((message: ClientMessage) => {
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
      wsRef.current?.close();
    };
  }, []);

  return { status, connect, disconnect, send };
}
