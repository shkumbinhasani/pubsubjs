import { wsTransport, wsPublisher } from "../transports/websocket";
import { redisPublisher } from "../transports/redis";
import { connectedUsers } from "../lib/users";
import { config } from "../lib/config";

/**
 * Handle WebSocket connection events
 */
export function setupConnectionHandlers() {
  // Transport emits "connect" with { connectionId } data for client connections
  wsTransport.on("connect", (data) => {
    if (!data) return; // Skip transport-level connect event (no data)
    const { connectionId } = data as { connectionId: string };

    console.log(`[${config.serverId}] Client connected: ${connectionId}`);

    // Send server info to the new client
    wsPublisher.publish("server.info", {
      serverId: config.serverId,
      connectedClients: connectedUsers.size,
      timestamp: Date.now(),
    }, {
      targetIds: [connectionId],
    });
  });

  // Transport emits "disconnect" with { connectionId } data for client disconnections
  wsTransport.on("disconnect", (data) => {
    if (!data) return; // Skip transport-level disconnect event (no data)
    const { connectionId } = data as { connectionId: string };

    const user = connectedUsers.get(connectionId);

    if (user) {
      console.log(`[${config.serverId}] User "${user.username}" disconnected`);
      connectedUsers.delete(connectionId);

      // Notify other servers
      redisPublisher.publish("redis.userLeft", {
        userId: connectionId,
        username: user.username,
        serverId: config.serverId,
        timestamp: Date.now(),
      });
    }
  });
}
