import { redisPublisher } from "./transports/redis";
import { connectedUsers } from "./lib/users";
import { config } from "./lib/config";
import index from "../client/index.html";

/**
 * HTTP routes
 */
export const routes = {
  "/": index,

  "/api/health": () => {
    return Response.json({
      status: "ok",
      serverId: config.serverId,
      connectedClients: connectedUsers.size,
    });
  },

  "/api/notify": async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await req.json();

    await redisPublisher.publish("redis.notification", {
      id: crypto.randomUUID(),
      type: body.type || "info",
      title: body.title || "Notification",
      message: body.message,
      timestamp: Date.now(),
      targetUserId: body.targetUserId,
    });

    return Response.json({ success: true });
  },
};
