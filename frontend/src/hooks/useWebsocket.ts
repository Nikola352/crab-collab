import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientMessage } from "../types/client-message";
import type { ServerMessage } from "../types/server-message";

export type MessageHandler = (msg: ServerMessage) => void;

export function useWebSocket(url: string) {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const messageHandlers = useRef<Map<string, MessageHandler>>(new Map());

  useEffect(() => {
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setIsConnected(true);
      console.log("WebSocket connected");
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      console.log("WebSocket disconnected");
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.current.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      setLastMessage(message);

      const handler = messageHandlers.current.get(message.type);
      if (handler) {
        handler(message);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [url]);

  const send = useCallback((message: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  const on = useCallback((messageType: string, handler: MessageHandler) => {
    messageHandlers.current.set(messageType, handler);
  }, []);

  return { isConnected, send, on, lastMessage };
}
