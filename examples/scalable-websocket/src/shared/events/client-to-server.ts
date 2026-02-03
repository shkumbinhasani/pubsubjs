import { z } from "zod";
import { defineEvent } from "@pubsubjs/core";

/**
 * Events sent FROM clients TO server (via WebSocket)
 */
export const ClientToServerEvents = defineEvent([
  {
    name: "client.message",
    schema: z.object({
      message: z.string(),
    }),
  },
  {
    name: "client.setUsername",
    schema: z.object({
      username: z.string(),
    }),
  },
]);

export type ClientToServerEvents = typeof ClientToServerEvents;
