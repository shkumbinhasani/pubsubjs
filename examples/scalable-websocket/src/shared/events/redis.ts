import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

/**
 * Events for server-to-server communication (via Redis)
 * Used for horizontal scaling across multiple server instances
 */
export const RedisEvents = defineEvent([
  {
    name: "redis.broadcast",
    schema: z.object({
      id: z.string(),
      from: z.string(),
      message: z.string(),
      timestamp: z.number(),
      originServerId: z.string(),
    }),
  },
  {
    name: "redis.userJoined",
    schema: z.object({
      userId: z.string(),
      username: z.string(),
      serverId: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "redis.userLeft",
    schema: z.object({
      userId: z.string(),
      username: z.string(),
      serverId: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "redis.notification",
    schema: z.object({
      id: z.string(),
      type: z.enum(["info", "success", "warning", "error"]),
      title: z.string(),
      message: z.string(),
      timestamp: z.number(),
      targetUserId: z.string().optional(),
    }),
  },
]);

export type RedisEvents = typeof RedisEvents;
