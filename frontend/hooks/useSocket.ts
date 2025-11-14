import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

// Shared socket instance across the app to avoid multiple connections
let sharedSocket: Socket | null = null;

export function disconnectSocket() {
  if (sharedSocket) {
    try {
      sharedSocket.disconnect();
    } catch (e) {
      // ignore
    }
    sharedSocket = null;
  }
}

export const useSocket = () => {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sharedSocket) {
      sharedSocket = io(
        process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001",
        {
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          timeout: 60000,
          transports: ["websocket"],
        }
      );
    }

    const socket = sharedSocket as Socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // set initial connected state
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      // intentionally do not disconnect the shared socket here
    };
  }, []);

  return {
    socket: sharedSocket,
    connected,
  };
};
