import { redisSubscriber } from "../transports/redis";
import { wsPublisher } from "../transports/websocket";
import { connectedUsers } from "../lib/users";

/**
 * Handle events from Redis (other server instances)
 */
export function setupRedisEventHandlers() {
  // Broadcast message from any server -> all clients on this server
  redisSubscriber.on("redis.broadcast", async (payload) => {
    await wsPublisher.publish("broadcast", {
      id: payload.id,
      from: payload.from,
      message: payload.message,
      timestamp: payload.timestamp,
    });
  });

  // User joined on another server
  redisSubscriber.on("redis.userJoined", async (payload) => {
    await wsPublisher.publish("user.joined", {
      userId: payload.userId,
      username: payload.username,
      timestamp: payload.timestamp,
    });
  });

  // User left on another server
  redisSubscriber.on("redis.userLeft", async (payload) => {
    await wsPublisher.publish("user.left", {
      userId: payload.userId,
      username: payload.username,
      timestamp: payload.timestamp,
    });
  });

  // Notification from Redis
  redisSubscriber.on("redis.notification", async (payload) => {
    if (payload.targetUserId) {
      // Send to specific user if they're on this server
      const user = connectedUsers.get(payload.targetUserId);
      if (user) {
        await wsPublisher.publish("notification", {
          id: payload.id,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          timestamp: payload.timestamp,
        }, {
          targetIds: [user.connectionId],
        });
      }
    } else {
      // Broadcast to all clients
      await wsPublisher.publish("notification", {
        id: payload.id,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        timestamp: payload.timestamp,
      });
    }
  });
}
