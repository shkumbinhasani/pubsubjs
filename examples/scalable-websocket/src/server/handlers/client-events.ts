import { wsSubscriber } from "../transports/websocket";
import { redisPublisher } from "../transports/redis";
import { connectedUsers } from "../lib/users";
import { config } from "../lib/config";

/**
 * Handle events from WebSocket clients
 */
export function setupClientEventHandlers() {
  // Client sets their username
  wsSubscriber.on("client.setUsername", (payload, { ctx }) => {
    const connectionId = ctx.connectionId;
    const userId = connectionId;

    connectedUsers.set(userId, {
      username: payload.username,
      connectionId,
    });

    console.log(`[${config.serverId}] User "${payload.username}" joined (${userId})`);

    // Broadcast to all servers via Redis
    redisPublisher.publish("redis.userJoined", {
      userId,
      username: payload.username,
      serverId: config.serverId,
      timestamp: Date.now(),
    });
  });

  // Client sends a message
  wsSubscriber.on("client.message", async (payload, { ctx }) => {
    const connectionId = ctx.connectionId;
    const user = connectedUsers.get(connectionId);
    const username = user?.username || "Anonymous";

    console.log(`[${config.serverId}] Message from "${username}": ${payload.message}`);

    // Broadcast to all servers via Redis
    await redisPublisher.publish("redis.broadcast", {
      id: crypto.randomUUID(),
      from: username,
      message: payload.message,
      timestamp: Date.now(),
      originServerId: config.serverId,
    });
  });
}
