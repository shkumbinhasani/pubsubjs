import { useState, useEffect } from "react";
import { transport, subscriber } from "../lib/pubsub";
import type { ServerInfo } from "../lib/types";

export function useConnection() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => setIsConnected(false);

    transport.on("connect", handleConnected);
    transport.on("disconnect", handleDisconnected);

    // Check if already connected
    if (transport.state === "connected") {
      setIsConnected(true);
    }

    subscriber.on("server.info", setServerInfo);
    subscriber.subscribe();

    return () => {
      transport.off("connect", handleConnected);
      transport.off("disconnect", handleDisconnected);
      subscriber.unsubscribe();
    };
  }, []);

  return { isConnected, serverInfo };
}
