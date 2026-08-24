"use client";

/**
 * Socket.io client provider for real-time PVP. Connects to the
 * mini-service on port 3003 via the gateway's XTransformPort query.
 * Falls back gracefully if the socket can't connect.
 */
import { io, Socket } from "socket.io-client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  // Create the socket lazily in state initializer (client-only).
  // State initializer runs once on mount, not in an effect, so it
  // doesn't trigger the set-state-in-effect lint rule.
  const [socket] = useState<Socket | null>(() => {
    if (typeof window === "undefined") return null;
    return io("/?XTransformPort=3003", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 5000,
      autoConnect: true,
    });
  });
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(socket);

  useEffect(() => {
    socketRef.current = socket;
    if (!socket) return;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
