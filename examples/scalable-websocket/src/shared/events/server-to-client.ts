import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

/**
 * Events sent FROM the server TO clients (via WebSocket)
 */
export const ServerToClientEvents = defineEvent([
  {
    name: "notification",
    schema: z.object({
      id: z.string(),
      type: z.enum(["info", "success", "warning", "error"]),
      title: z.string(),
      message: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "user.joined",
    schema: z.object({
      userId: z.string(),
      username: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "user.left",
    schema: z.object({
      userId: z.string(),
      username: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "broadcast",
    schema: z.object({
      id: z.string(),
      from: z.string(),
      message: z.string(),
      timestamp: z.number(),
    }),
  },
  {
    name: "server.info",
    schema: z.object({
      serverId: z.string(),
      connectedClients: z.number(),
      timestamp: z.number(),
    }),
  },
]);

export type ServerToClientEvents = typeof ServerToClientEvents;
